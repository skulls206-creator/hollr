import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { khurkAppDismissalsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

// GET /api/khurk-apps/dismissed
// Returns the list of appIds the authenticated user has dismissed.
router.get("/khurk-apps/dismissed", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select({ appId: khurkAppDismissalsTable.appId })
    .from(khurkAppDismissalsTable)
    .where(eq(khurkAppDismissalsTable.userId, req.user.id));
  res.json({ dismissed: rows.map((r) => r.appId) });
});

// POST /api/khurk-apps/dismiss/:appId
// Dismisses (hides) one KHURK app for the authenticated user.
router.post("/khurk-apps/dismiss/:appId", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { appId } = req.params;
  if (!appId || appId.length > 32) {
    res.status(400).json({ error: "Invalid appId" });
    return;
  }
  await db
    .insert(khurkAppDismissalsTable)
    .values({ userId: req.user.id, appId })
    .onConflictDoNothing();
  res.json({ success: true });
});

// POST /api/khurk-apps/dismiss-all
// Dismisses all KHURK apps for the authenticated user.
router.post("/khurk-apps/dismiss-all", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const ALL_IDS = [
    "ustream", "playd", "foldr", "instaghost",
    "gasless", "ballpoint", "onlygames", "onlyxmr", "hollr",
  ];
  await db
    .insert(khurkAppDismissalsTable)
    .values(ALL_IDS.map((appId) => ({ userId: req.user.id, appId })))
    .onConflictDoNothing();
  res.json({ success: true });
});

// DELETE /api/khurk-apps/dismissed
// Restores all KHURK apps (removes all dismissals) for the authenticated user.
router.delete("/khurk-apps/dismissed", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await db
    .delete(khurkAppDismissalsTable)
    .where(eq(khurkAppDismissalsTable.userId, req.user.id));
  res.json({ success: true });
});

export default router;
