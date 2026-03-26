import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

// GET /api/notifications — list 50 most recent for current user
router.get("/notifications", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.query.notificationsTable.findMany({
    where: eq(notificationsTable.userId, req.user.id),
    orderBy: [desc(notificationsTable.createdAt)],
    limit: 50,
  });

  res.json(rows.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })));
});

// POST /api/notifications/read-all — mark all as read
router.post("/notifications/read-all", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.userId, req.user.id), eq(notificationsTable.read, false)));

  res.json({ ok: true });
});

// POST /api/notifications/:id/read — mark single as read
router.post("/notifications/:id/read", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, req.params.id), eq(notificationsTable.userId, req.user.id)));

  res.json({ ok: true });
});

export default router;
