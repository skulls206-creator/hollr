import { Router } from "express";
import { db } from "@workspace/db";
import { pushSubscriptionsTable, notificationPrefsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

// Public VAPID key — frontend needs this to subscribe
router.get("/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
});

// Save a push subscription
router.post("/push/subscribe", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { endpoint, keys } = req.body ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "Invalid subscription object" }); return;
  }

  await db
    .insert(pushSubscriptionsTable)
    .values({ userId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth },
    });

  res.json({ ok: true });
});

// Remove a push subscription
router.delete("/push/subscribe", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { endpoint } = req.body ?? {};
  if (!endpoint) { res.status(400).json({ error: "Missing endpoint" }); return; }

  await db.delete(pushSubscriptionsTable).where(
    and(eq(pushSubscriptionsTable.userId, req.user.id), eq(pushSubscriptionsTable.endpoint, endpoint))
  );

  res.json({ ok: true });
});

// Get notification preferences
router.get("/push/preferences", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const row = await db.query.notificationPrefsTable.findFirst({
    where: eq(notificationPrefsTable.userId, req.user.id),
  });

  res.json({
    muteDms: row?.muteDms ?? false,
    mutedChannelIds: row ? JSON.parse(row.mutedChannelIds) : [],
  });
});

// Update notification preferences
router.put("/push/preferences", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { muteDms, mutedChannelIds } = req.body ?? {};

  await db
    .insert(notificationPrefsTable)
    .values({
      userId: req.user.id,
      muteDms: !!muteDms,
      mutedChannelIds: JSON.stringify(Array.isArray(mutedChannelIds) ? mutedChannelIds : []),
    })
    .onConflictDoUpdate({
      target: notificationPrefsTable.userId,
      set: {
        muteDms: !!muteDms,
        mutedChannelIds: JSON.stringify(Array.isArray(mutedChannelIds) ? mutedChannelIds : []),
      },
    });

  res.json({ ok: true });
});

export default router;
