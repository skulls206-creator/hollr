import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db, foldrFilesTable } from "@workspace/db";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const LIGHTHOUSE_API_KEY = process.env.LIGHTHOUSE_API_KEY ?? "";
const LIGHTHOUSE_UPLOAD_URL = "https://node.lighthouse.storage/api/v0/add";

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.user.id;
}

/**
 * POST /api/foldr/upload
 * Upload a file to Lighthouse (IPFS) and record it in the DB.
 */
router.post("/foldr/upload", upload.single("file"), async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
    formData.append("file", blob, file.originalname);

    const response = await fetch(LIGHTHOUSE_UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${LIGHTHOUSE_API_KEY}` },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[Foldr] Lighthouse upload error:", text);
      res.status(502).json({ error: "Upload to Lighthouse failed" });
      return;
    }

    const result = await response.json() as { Name: string; Hash: string; Size: string };

    const [row] = await db.insert(foldrFilesTable).values({
      userId,
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      cid: result.Hash,
    }).returning();

    res.json({
      id: row.id,
      name: row.name,
      size: row.size,
      mimeType: row.mimeType,
      cid: row.cid,
      url: `https://gateway.lighthouse.storage/ipfs/${row.cid}`,
      uploadedAt: row.uploadedAt,
    });
  } catch (err) {
    console.error("[Foldr] upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

/**
 * GET /api/foldr/files
 * List files belonging to the current user.
 */
router.get("/foldr/files", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const files = await db
      .select()
      .from(foldrFilesTable)
      .where(and(eq(foldrFilesTable.userId, userId), isNull(foldrFilesTable.deletedAt)))
      .orderBy(desc(foldrFilesTable.uploadedAt));

    res.json(files.map(f => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      cid: f.cid,
      url: `https://gateway.lighthouse.storage/ipfs/${f.cid}`,
      uploadedAt: f.uploadedAt,
    })));
  } catch (err) {
    console.error("[Foldr] list error:", err);
    res.status(500).json({ error: "Failed to list files" });
  }
});

/**
 * DELETE /api/foldr/files/:id
 * Soft-delete a file record. File remains pinned on Lighthouse/IPFS.
 */
router.delete("/foldr/files/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const [row] = await db
      .update(foldrFilesTable)
      .set({ deletedAt: new Date() })
      .where(and(eq(foldrFilesTable.id, req.params.id), eq(foldrFilesTable.userId, userId)))
      .returning();

    if (!row) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[Foldr] delete error:", err);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

export default router;
