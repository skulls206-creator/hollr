import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, ballpointNotesTable } from "@workspace/db";
import { encryptNote, decryptNote, encrypt, decrypt } from "../lib/ballpoint-crypto";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.user.id;
}

/** Decrypt a DB row and return it as a plain object safe for the API response. */
function toPublic(row: typeof ballpointNotesTable.$inferSelect) {
  return decryptNote(row);
}

/** GET /api/ballpoint/notes */
router.get("/ballpoint/notes", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const notes = await db
      .select()
      .from(ballpointNotesTable)
      .where(and(eq(ballpointNotesTable.userId, userId), eq(ballpointNotesTable.isTrashed, false)))
      .orderBy(desc(ballpointNotesTable.updatedAt));
    res.json(notes.map(toPublic));
  } catch (err) {
    console.error("[Ballpoint] list error:", err);
    res.status(500).json({ error: "Failed to list notes" });
  }
});

/** GET /api/ballpoint/notes/trash */
router.get("/ballpoint/notes/trash", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const notes = await db
      .select()
      .from(ballpointNotesTable)
      .where(and(eq(ballpointNotesTable.userId, userId), eq(ballpointNotesTable.isTrashed, true)))
      .orderBy(desc(ballpointNotesTable.updatedAt));
    res.json(notes.map(toPublic));
  } catch (err) {
    console.error("[Ballpoint] trash list error:", err);
    res.status(500).json({ error: "Failed to list trash" });
  }
});

/** POST /api/ballpoint/notes */
router.post("/ballpoint/notes", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const { title = "Untitled", content = "" } = req.body;
    const encrypted = encryptNote({ title, content });
    const [note] = await db
      .insert(ballpointNotesTable)
      .values({ userId, title: encrypted.title, content: encrypted.content })
      .returning();
    res.status(201).json(toPublic(note));
  } catch (err) {
    console.error("[Ballpoint] create error:", err);
    res.status(500).json({ error: "Failed to create note" });
  }
});

/** PATCH /api/ballpoint/notes/:id */
router.patch("/ballpoint/notes/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const { title, content, isPinned, isArchived, isTrashed } = req.body;
    const update: Partial<typeof ballpointNotesTable.$inferInsert> = {};

    // Encrypt text fields before storing
    if (title !== undefined)    update.title   = encrypt(title);
    if (content !== undefined)  update.content = encrypt(content);

    // Non-sensitive flags stay as-is
    if (isPinned !== undefined)   update.isPinned   = isPinned;
    if (isArchived !== undefined) update.isArchived = isArchived;
    if (isTrashed !== undefined)  update.isTrashed  = isTrashed;

    const [note] = await db
      .update(ballpointNotesTable)
      .set(update)
      .where(and(eq(ballpointNotesTable.id, req.params.id), eq(ballpointNotesTable.userId, userId)))
      .returning();

    if (!note) { res.status(404).json({ error: "Note not found" }); return; }
    res.json(toPublic(note));
  } catch (err) {
    console.error("[Ballpoint] update error:", err);
    res.status(500).json({ error: "Failed to update note" });
  }
});

/** DELETE /api/ballpoint/notes/:id — permanent delete */
router.delete("/ballpoint/notes/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const [row] = await db
      .delete(ballpointNotesTable)
      .where(and(eq(ballpointNotesTable.id, req.params.id), eq(ballpointNotesTable.userId, userId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Note not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    console.error("[Ballpoint] delete error:", err);
    res.status(500).json({ error: "Failed to delete note" });
  }
});

export default router;
