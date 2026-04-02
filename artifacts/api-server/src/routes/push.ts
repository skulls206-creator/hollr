import { Router } from "express";
import { db } from "@workspace/db";
import { pushSubscriptionsTable, notificationPrefsTable, expoPushTokensTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { sendPushToUser } from "../lib/push";
import { Expo } from "expo-server-sdk";

const router = Router();

// Public VAPID key — frontend needs this to subscribe
router.get("/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
});

// Save a push subscription (registers this device)
router.post("/push/subscribe", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { endpoint, keys, label } = req.body ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "Invalid subscription object" }); return;
  }

  await db
    .insert(pushSubscriptionsTable)
    .values({ userId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, label: label ?? null })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth },
    });

  res.json({ ok: true });
});

// Remove a push subscription (unregisters this device)
router.delete("/push/subscribe", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { endpoint } = req.body ?? {};
  if (!endpoint) { res.status(400).json({ error: "Missing endpoint" }); return; }

  await db.delete(pushSubscriptionsTable).where(
    and(eq(pushSubscriptionsTable.userId, req.user.id), eq(pushSubscriptionsTable.endpoint, endpoint))
  );

  res.json({ ok: true });
});

// List all registered devices for this user (returns safe subset — no keys)
router.get("/push/devices", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const subs = await db.query.pushSubscriptionsTable.findMany({
    where: eq(pushSubscriptionsTable.userId, req.user.id),
    columns: { id: true, label: true, quiet: true, createdAt: true, endpoint: true },
  });

  // Return endpoint as a short fingerprint to avoid leaking full URLs,
  // but include enough for the frontend to match "this device"
  res.json(subs.map(s => ({
    id: s.id,
    label: s.label ?? null,
    quiet: s.quiet,
    createdAt: s.createdAt,
    endpointHint: s.endpoint.slice(-16), // last 16 chars — unique enough for matching
    endpoint: s.endpoint,                // full endpoint for "is this device?" check
  })));
});

// Update per-device settings (label / quiet mode)
router.patch("/push/devices/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { label, quiet } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = typeof label === "string" ? label.slice(0, 64) : null;
  if (quiet !== undefined) updates.quiet = !!quiet;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

  await db
    .update(pushSubscriptionsTable)
    .set(updates)
    .where(and(eq(pushSubscriptionsTable.id, req.params.id), eq(pushSubscriptionsTable.userId, req.user.id)));

  res.json({ ok: true });
});

// Remove a specific device by id
router.delete("/push/devices/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db.delete(pushSubscriptionsTable).where(
    and(eq(pushSubscriptionsTable.id, req.params.id), eq(pushSubscriptionsTable.userId, req.user.id))
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

// Test endpoint — fires a push to yourself so you can verify click-to-navigate works
router.post("/push/test", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { navType, serverId, channelId, threadId } = req.body ?? {};

  let nav: any = null;
  let url = "/app";

  if (navType === "channel" && serverId && channelId) {
    nav = { type: "channel", serverId, channelId };
    url = `/app?navType=channel&serverId=${serverId}&channelId=${channelId}`;
  } else if (navType === "dm" && threadId) {
    nav = { type: "dm", threadId };
    url = `/app?navType=dm&threadId=${threadId}`;
  }

  await sendPushToUser(req.user.id, {
    title: "hollr.chat — Test Notification",
    body: nav ? `Click to navigate to your ${navType === "dm" ? "DM" : "channel"}` : "Test push notification from hollr.",
    url,
    tag: "push-test",
    nav,
  });

  res.json({ ok: true });
});

// Register an Expo push token (mobile app — called after Expo permission grant)
router.post("/push/expo-token", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { token, label } = req.body ?? {};
  if (!token || !Expo.isExpoPushToken(token)) {
    res.status(400).json({ error: "Invalid Expo push token" }); return;
  }

  await db
    .insert(expoPushTokensTable)
    .values({ userId: req.user.id, token, label: label ?? null })
    .onConflictDoUpdate({
      target: expoPushTokensTable.token,
      set: { userId: req.user.id },
    });

  res.json({ ok: true });
});

// Remove an Expo push token (on sign-out or token refresh)
router.delete("/push/expo-token", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { token } = req.body ?? {};
  if (!token) { res.status(400).json({ error: "Missing token" }); return; }

  await db.delete(expoPushTokensTable).where(
    and(eq(expoPushTokensTable.userId, req.user.id), eq(expoPushTokensTable.token, token))
  );

  res.json({ ok: true });
});

export default router;
