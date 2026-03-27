import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { eq, and, isNull, isNotNull, desc, asc } from "drizzle-orm";
import { db, foldrFilesTable, foldrFoldersTable, foldrUserKeysTable } from "@workspace/db";
import { decryptFile } from "../lib/foldr-crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, getR2BucketName } from "../lib/r2Client";
import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from "crypto";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const PRIVATE_OBJECT_DIR = (process.env.PRIVATE_OBJECT_DIR ?? "").replace(/^\//, "");
const MASTER_HEX = process.env.FOLDR_ENCRYPTION_KEY;
const MASTER_KEY = MASTER_HEX ? Buffer.from(MASTER_HEX, "hex") : null;
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function _encrypt(key: Buffer, plainBuf: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

function _decrypt(key: Buffer, packed: Buffer): Buffer {
  const iv = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = packed.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.user.id;
}

function filePublic(f: typeof foldrFilesTable.$inferSelect, req: Request) {
  const base = `${req.protocol}://${req.get("host")}`;
  const downloadUrl = `${base}/api/foldr/files/${f.id}/content`;
  return {
    id: f.id,
    folderId: f.folderId,
    name: f.name,
    size: f.size,
    mimeType: f.mimeType,
    cid: f.cid,
    isEncrypted: f.isEncrypted,
    isClientEncrypted: f.isClientEncrypted,
    iv: f.iv,
    isStarred: f.isStarred,
    sortOrder: f.sortOrder,
    url: downloadUrl,
    uploadedAt: f.uploadedAt,
    deletedAt: f.deletedAt,
  };
}

/* ── Per-user Key Management ──────────────────────────────────────────── */

/**
 * GET /api/foldr/key — get the user's unwrapped AES key bytes (base64)
 * The server wraps (encrypts) the user's key with the master key.
 * This endpoint unwraps and returns the raw key bytes so the browser can import it.
 */
router.get("/foldr/key", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  if (!MASTER_KEY) {
    res.status(500).json({ error: "Server encryption not configured" });
    return;
  }

  try {
    const [row] = await db
      .select()
      .from(foldrUserKeysTable)
      .where(eq(foldrUserKeysTable.userId, userId));

    if (!row) {
      res.status(404).json({ error: "No key found" });
      return;
    }

    const wrappedBuf = Buffer.from(row.wrappedKey, "base64");
    const rawKeyBuf = _decrypt(MASTER_KEY, wrappedBuf);
    res.json({ key: rawKeyBuf.toString("base64") });
  } catch (err) {
    console.error("[Foldr] key fetch error:", err);
    res.status(500).json({ error: "Failed to retrieve key" });
  }
});

/**
 * POST /api/foldr/key — store a new user key (wrapped by the browser with a server-generated nonce)
 * Body: { key: base64-encoded raw 32-byte AES key }
 * Server wraps it with MASTER_KEY and stores it.
 */
router.post("/foldr/key", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  if (!MASTER_KEY) {
    res.status(500).json({ error: "Server encryption not configured" });
    return;
  }

  const { key } = req.body;
  if (!key || typeof key !== "string") {
    res.status(400).json({ error: "key (base64) required" });
    return;
  }

  try {
    const rawKeyBuf = Buffer.from(key, "base64");
    if (rawKeyBuf.length !== 32) {
      res.status(400).json({ error: "key must be 32 bytes" });
      return;
    }

    const wrappedBuf = _encrypt(MASTER_KEY, rawKeyBuf);
    const wrappedKey = wrappedBuf.toString("base64");

    await db
      .insert(foldrUserKeysTable)
      .values({ userId, wrappedKey })
      .onConflictDoUpdate({
        target: foldrUserKeysTable.userId,
        set: { wrappedKey },
      });

    res.json({ ok: true });
  } catch (err) {
    console.error("[Foldr] key store error:", err);
    res.status(500).json({ error: "Failed to store key" });
  }
});

/* ── Presigned upload URL ─────────────────────────────────────────────── */

/**
 * POST /api/foldr/upload-url — request a presigned PUT URL for client-side encrypted upload
 * Body: { name, size, mimeType, folderId?, iv }
 * Returns: { uploadUrl, objectKey, fileId (pre-inserted DB row) }
 */
router.post("/foldr/upload-url", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { name, size, mimeType, folderId, iv } = req.body;

  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name required" });
    return;
  }
  if (typeof size !== "number" || size <= 0) {
    res.status(400).json({ error: "size required" });
    return;
  }
  if (size > 100 * 1024 * 1024) {
    res.status(413).json({ error: "File too large. Maximum size is 100 MB." });
    return;
  }
  if (!iv || typeof iv !== "string") {
    res.status(400).json({ error: "iv (base64) required" });
    return;
  }

  // Validate iv decodes to exactly 12 bytes (AES-GCM nonce)
  try {
    const ivBytes = Buffer.from(iv, "base64");
    if (ivBytes.length !== 12) {
      res.status(400).json({ error: "iv must be a 12-byte base64 value" });
      return;
    }
  } catch {
    res.status(400).json({ error: "iv must be valid base64" });
    return;
  }

  try {
    const objectId = randomUUID();
    const objectKey = `${PRIVATE_OBJECT_DIR}/foldr/${userId}/${objectId}.enc`.replace(/^\//, "");

    const r2 = getR2Client();
    const bucket = getR2BucketName();

    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: "application/octet-stream",
    });
    const uploadUrl = await getSignedUrl(r2, cmd, { expiresIn: 900 });

    const [row] = await db.insert(foldrFilesTable).values({
      userId,
      folderId: folderId || null,
      name: name.slice(0, 512),
      size,
      mimeType: mimeType || "application/octet-stream",
      cid: objectKey,
      isEncrypted: true,
      isClientEncrypted: true,
      iv,
      encryptedKey: null,
    }).returning();

    res.json({ uploadUrl, objectKey, fileId: row.id, file: filePublic(row, req) });
  } catch (err) {
    console.error("[Foldr] upload-url error:", err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /api/foldr/upload-confirm/:id — confirm upload completed (no-op, file already inserted)
 */
router.post("/foldr/upload-confirm/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const [row] = await db
      .select()
      .from(foldrFilesTable)
      .where(and(eq(foldrFilesTable.id, req.params.id), eq(foldrFilesTable.userId, userId)));
    if (!row) { res.status(404).json({ error: "File not found" }); return; }
    res.json(filePublic(row, req));
  } catch (err) {
    console.error("[Foldr] upload-confirm error:", err);
    res.status(500).json({ error: "Failed to confirm upload" });
  }
});

/* ── Presigned download URL ───────────────────────────────────────────── */

/**
 * GET /api/foldr/files/:id/download-url — get a presigned GET URL for client-side decryption
 * Returns: { downloadUrl, iv, mimeType, name }
 */
router.get("/foldr/files/:id/download-url", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const [file] = await db
      .select()
      .from(foldrFilesTable)
      .where(and(eq(foldrFilesTable.id, req.params.id), eq(foldrFilesTable.userId, userId)));

    if (!file) { res.status(404).json({ error: "File not found" }); return; }
    if (!file.cid) { res.status(404).json({ error: "File storage key missing" }); return; }

    if (!file.isClientEncrypted) {
      res.status(400).json({ error: "File is not client-encrypted; use /content endpoint" });
      return;
    }

    const r2 = getR2Client();
    const bucket = getR2BucketName();
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: file.cid });
    const downloadUrl = await getSignedUrl(r2, cmd, { expiresIn: 3600 });

    res.json({
      downloadUrl,
      iv: file.iv,
      mimeType: file.mimeType,
      name: file.name,
    });
  } catch (err) {
    console.error("[Foldr] download-url error:", err);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

/* ── Folders ──────────────────────────────────────────────────────────── */

/** GET /api/foldr/folders — all folders for user */
router.get("/foldr/folders", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const folders = await db
      .select()
      .from(foldrFoldersTable)
      .where(eq(foldrFoldersTable.userId, userId))
      .orderBy(asc(foldrFoldersTable.sortOrder), asc(foldrFoldersTable.name));
    res.json(folders);
  } catch (err) {
    console.error("[Foldr] folders list error:", err);
    res.status(500).json({ error: "Failed to list folders" });
  }
});

/** POST /api/foldr/folders — create folder */
router.post("/foldr/folders", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const { name, parentId } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name required" });
      return;
    }
    const [folder] = await db.insert(foldrFoldersTable)
      .values({ userId, name: name.slice(0, 255), parentId: parentId ?? null })
      .returning();
    res.status(201).json(folder);
  } catch (err) {
    console.error("[Foldr] create folder error:", err);
    res.status(500).json({ error: "Failed to create folder" });
  }
});

/** PATCH /api/foldr/folders/:id — rename / move / reorder */
router.patch("/foldr/folders/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const update: Partial<typeof foldrFoldersTable.$inferInsert> = {};
    const { name, parentId, sortOrder } = req.body;
    if (name !== undefined)      update.name      = name;
    if (parentId !== undefined)  update.parentId  = parentId;
    if (sortOrder !== undefined) update.sortOrder = sortOrder;
    const [folder] = await db.update(foldrFoldersTable)
      .set(update)
      .where(and(eq(foldrFoldersTable.id, req.params.id), eq(foldrFoldersTable.userId, userId)))
      .returning();
    if (!folder) { res.status(404).json({ error: "Folder not found" }); return; }
    res.json(folder);
  } catch (err) {
    console.error("[Foldr] update folder error:", err);
    res.status(500).json({ error: "Failed to update folder" });
  }
});

/** DELETE /api/foldr/folders/:id — move children to parent, then delete */
router.delete("/foldr/folders/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const [folder] = await db
      .select()
      .from(foldrFoldersTable)
      .where(and(eq(foldrFoldersTable.id, req.params.id), eq(foldrFoldersTable.userId, userId)));
    if (!folder) { res.status(404).json({ error: "Folder not found" }); return; }

    await db.update(foldrFoldersTable)
      .set({ parentId: folder.parentId })
      .where(and(eq(foldrFoldersTable.parentId, folder.id), eq(foldrFoldersTable.userId, userId)));
    await db.update(foldrFilesTable)
      .set({ folderId: folder.parentId })
      .where(and(eq(foldrFilesTable.folderId, folder.id), eq(foldrFilesTable.userId, userId)));

    await db.delete(foldrFoldersTable)
      .where(and(eq(foldrFoldersTable.id, folder.id), eq(foldrFoldersTable.userId, userId)));

    res.json({ ok: true });
  } catch (err) {
    console.error("[Foldr] delete folder error:", err);
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

/* ── Files ────────────────────────────────────────────────────────────── */

/** GET /api/foldr/files — list files (filter by folderId, starred, trash) */
router.get("/foldr/files", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const { folderId, starred, trash } = req.query;

    let where;
    if (trash === "1") {
      where = and(eq(foldrFilesTable.userId, userId), isNotNull(foldrFilesTable.deletedAt));
    } else if (starred === "1") {
      where = and(
        eq(foldrFilesTable.userId, userId),
        eq(foldrFilesTable.isStarred, true),
        isNull(foldrFilesTable.deletedAt),
      );
    } else if (folderId === "root" || folderId === "") {
      where = and(
        eq(foldrFilesTable.userId, userId),
        isNull(foldrFilesTable.folderId),
        isNull(foldrFilesTable.deletedAt),
      );
    } else if (typeof folderId === "string" && folderId) {
      where = and(
        eq(foldrFilesTable.userId, userId),
        eq(foldrFilesTable.folderId, folderId),
        isNull(foldrFilesTable.deletedAt),
      );
    } else {
      where = and(
        eq(foldrFilesTable.userId, userId),
        isNull(foldrFilesTable.folderId),
        isNull(foldrFilesTable.deletedAt),
      );
    }

    const files = await db
      .select()
      .from(foldrFilesTable)
      .where(where)
      .orderBy(asc(foldrFilesTable.sortOrder), desc(foldrFilesTable.uploadedAt));

    res.json(files.map(f => filePublic(f, req)));
  } catch (err) {
    console.error("[Foldr] list error:", err);
    res.status(500).json({ error: "Failed to list files" });
  }
});

/** GET /api/foldr/files/:id/content — legacy server-side decrypt path for old files */
router.get("/foldr/files/:id/content", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const [file] = await db
      .select()
      .from(foldrFilesTable)
      .where(and(eq(foldrFilesTable.id, req.params.id), eq(foldrFilesTable.userId, userId)));

    if (!file) { res.status(404).json({ error: "File not found" }); return; }
    if (!file.cid) { res.status(404).json({ error: "File storage key missing" }); return; }

    if (file.isClientEncrypted) {
      res.status(400).json({ error: "Client-encrypted files must be decrypted in the browser. Use /download-url endpoint." });
      return;
    }

    const r2 = getR2Client();
    const bucket = getR2BucketName();
    const r2Res = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: file.cid }));

    if (!r2Res.Body) { res.status(502).json({ error: "Empty response from storage" }); return; }

    const encryptedBuf = Buffer.from(await r2Res.Body.transformToByteArray());

    const finalBuf = (file.isEncrypted && file.encryptedKey)
      ? decryptFile(encryptedBuf, file.encryptedKey)
      : encryptedBuf;

    const isDownload = req.query.download === "1";
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", finalBuf.length.toString());
    res.setHeader("Content-Disposition",
      `${isDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(file.name)}"`
    );
    res.send(finalBuf);
  } catch (err) {
    console.error("[Foldr] content error:", err);
    res.status(500).json({ error: "Failed to serve file" });
  }
});

/** PATCH /api/foldr/files/:id — update name, folderId, isStarred, sortOrder */
router.patch("/foldr/files/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const update: Partial<typeof foldrFilesTable.$inferInsert> = {};
    const { name, folderId, isStarred, sortOrder, restore } = req.body;
    if (name !== undefined)      update.name      = name;
    if (folderId !== undefined)  update.folderId  = folderId || null;
    if (isStarred !== undefined) update.isStarred = isStarred;
    if (sortOrder !== undefined) update.sortOrder = sortOrder;
    if (restore === true)        update.deletedAt = null;

    const [row] = await db.update(foldrFilesTable)
      .set(update)
      .where(and(eq(foldrFilesTable.id, req.params.id), eq(foldrFilesTable.userId, userId)))
      .returning();

    if (!row) { res.status(404).json({ error: "File not found" }); return; }
    res.json(filePublic(row, req));
  } catch (err) {
    console.error("[Foldr] update file error:", err);
    res.status(500).json({ error: "Failed to update file" });
  }
});

/** DELETE /api/foldr/files/:id — soft delete (trash) or hard delete */
router.delete("/foldr/files/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const hard = req.query.hard === "1";
  try {
    if (hard) {
      const [row] = await db.delete(foldrFilesTable)
        .where(and(eq(foldrFilesTable.id, req.params.id), eq(foldrFilesTable.userId, userId)))
        .returning();
      if (!row) { res.status(404).json({ error: "File not found" }); return; }
      if (row.cid) {
        try {
          const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
          await getR2Client().send(new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: row.cid }));
        } catch { /* ignore storage cleanup errors */ }
      }
    } else {
      const [row] = await db.update(foldrFilesTable)
        .set({ deletedAt: new Date() })
        .where(and(eq(foldrFilesTable.id, req.params.id), eq(foldrFilesTable.userId, userId)))
        .returning();
      if (!row) { res.status(404).json({ error: "File not found" }); return; }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[Foldr] delete error:", err);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

export default router;
