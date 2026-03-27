import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { eq, and, isNull, isNotNull, desc, asc } from "drizzle-orm";
import { db, foldrFilesTable, foldrFoldersTable } from "@workspace/db";
import { encryptFile, decryptFile } from "../lib/foldr-crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, getR2BucketName } from "../lib/r2Client";
import { randomUUID } from "crypto";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const PRIVATE_OBJECT_DIR = (process.env.PRIVATE_OBJECT_DIR ?? "").replace(/^\//, "");

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
    isStarred: f.isStarred,
    sortOrder: f.sortOrder,
    url: downloadUrl,
    uploadedAt: f.uploadedAt,
    deletedAt: f.deletedAt,
  };
}

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

    // Move children to parent (or root)
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

/** POST /api/foldr/upload — encrypt then upload to R2 object storage */
router.post("/foldr/upload", upload.single("file"), async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const file = req.file;
  if (!file) { res.status(400).json({ error: "No file provided" }); return; }

  try {
    const { folderId } = req.body;

    // Encrypt file content (AES-256-GCM)
    const { encryptedBuf, encryptedKey } = encryptFile(file.buffer);

    // Upload encrypted bytes to R2 object storage
    const objectId = randomUUID();
    const objectKey = `${PRIVATE_OBJECT_DIR}/foldr/${userId}/${objectId}.enc`.replace(/^\//, "");

    const r2 = getR2Client();
    const bucket = getR2BucketName();

    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: Buffer.from(encryptedBuf),
      ContentType: "application/octet-stream",
    }));

    const [row] = await db.insert(foldrFilesTable).values({
      userId,
      folderId: folderId || null,
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      cid: objectKey,          // repurpose cid column to store the R2 object key
      isEncrypted: true,
      encryptedKey,
    }).returning();

    res.json(filePublic(row, req));
  } catch (err) {
    console.error("[Foldr] upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

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
      // No folderId — root (null folderId)
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

/** GET /api/foldr/files/:id/content — decrypt and stream file content */
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

    // Fetch encrypted bytes from R2
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
      // Best-effort: remove the R2 object
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
