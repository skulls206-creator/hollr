import {
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { getR2Client, getR2BucketName } from "./r2Client";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
  R2Object,
} from "./objectAcl";

const R2_ENDPOINT = process.env.R2_ENDPOINT;

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<R2Object | null> {
    const client = getR2Client();
    const bucketName = getR2BucketName();

    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const objectKey = `${searchPath}/${filePath}`.replace(/^\//, "");

      try {
        await client.send(
          new HeadObjectCommand({ Bucket: bucketName, Key: objectKey })
        );
        return { key: objectKey, bucket: bucketName };
      } catch (err: any) {
        if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
          continue;
        }
        throw err;
      }
    }

    return null;
  }

  async downloadObject(obj: R2Object, cacheTtlSec: number = 3600): Promise<Response> {
    const client = getR2Client();
    const aclPolicy = await getObjectAclPolicy(obj);
    const isPublic = aclPolicy?.visibility === "public";

    const result = await client.send(
      new GetObjectCommand({ Bucket: obj.bucket, Key: obj.key })
    );

    const contentType = result.ContentType || "application/octet-stream";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (result.ContentLength !== undefined) {
      headers["Content-Length"] = String(result.ContentLength);
    }

    const body = result.Body;
    if (!body) {
      return new Response(null, { headers });
    }

    const nodeStream = body.transformToWebStream();
    return new Response(nodeStream as ReadableStream, { headers });
  }

  async getObjectEntityUploadURL(contentType?: string): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const client = getR2Client();
    const bucketName = getR2BucketName();

    const objectId = randomUUID();
    const objectKey = `${privateObjectDir}/uploads/${objectId}`.replace(/^\//, "");

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(client, command, { expiresIn: 900 });
    return signedUrl;
  }

  async getObjectEntityFile(objectPath: string): Promise<R2Object> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectKey = `${entityDir}${entityId}`.replace(/^\//, "");

    const client = getR2Client();
    const bucketName = getR2BucketName();

    try {
      await client.send(
        new HeadObjectCommand({ Bucket: bucketName, Key: objectKey })
      );
    } catch (err: any) {
      if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
        throw new ObjectNotFoundError();
      }
      throw err;
    }

    return { key: objectKey, bucket: bucketName };
  }

  normalizeObjectEntityPath(rawPath: string): string {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawPath);
    } catch {
      return rawPath;
    }

    const r2Endpoint = process.env.R2_ENDPOINT || "";
    let isR2Url = false;

    if (r2Endpoint) {
      try {
        const endpointUrl = new URL(r2Endpoint);
        if (parsedUrl.hostname === endpointUrl.hostname) {
          isR2Url = true;
        }
      } catch {
      }
    }

    if (!isR2Url) {
      const cloudflareDomains = ["r2.cloudflarestorage.com", "cloudflarestorage.com", "r2.dev"];
      isR2Url = cloudflareDomains.some((d) => parsedUrl.hostname.endsWith(d));
    }

    if (!isR2Url) {
      return rawPath;
    }

    const rawObjectPath = parsedUrl.pathname;

    let bucketName: string;
    try {
      bucketName = getR2BucketName();
    } catch {
      return rawPath;
    }

    const bucketPrefix = `/${bucketName}/`;

    let objectKey: string;
    if (rawObjectPath.startsWith(bucketPrefix)) {
      objectKey = rawObjectPath.slice(bucketPrefix.length);
    } else if (rawObjectPath === `/${bucketName}`) {
      objectKey = "";
    } else {
      objectKey = rawObjectPath.replace(/^\//, "");
    }

    let entityDir: string;
    try {
      entityDir = this.getPrivateObjectDir();
    } catch {
      return rawPath;
    }
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const normalizedEntityDir = entityDir.replace(/^\//, "");

    if (!objectKey.startsWith(normalizedEntityDir)) {
      return rawObjectPath;
    }

    const entityId = objectKey.slice(normalizedEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: R2Object;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}
