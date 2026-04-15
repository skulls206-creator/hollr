import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { userProfilesTable, usersTable } from "@workspace/db/schema";
import { eq, ilike } from "drizzle-orm";
import { UpdateMyProfileBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/users/me", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = req.user.id;

  let profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });

  if (!profile) {
    const fallbackUsername = req.user.username ?? `user_${userId.slice(0, 8)}`;
    const fallbackDisplay = fallbackUsername;

    [profile] = await db
      .insert(userProfilesTable)
      .values({
        userId,
        username: fallbackUsername,
        displayName: fallbackDisplay,
        status: "online",
      })
      .returning();
  }

  res.json({
    id: userId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    status: profile.status,
    customStatus: profile.customStatus,
    isSupporter: profile.isSupporter,
    isGrandfathered: profile.isGrandfathered,
    createdAt: profile.createdAt.toISOString(),
  });
});

router.patch("/users/me", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.user.id;

  const [profile] = await db
    .update(userProfilesTable)
    .set({
      ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
      ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: parsed.data.avatarUrl } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.customStatus !== undefined ? { customStatus: parsed.data.customStatus } : {}),
    })
    .where(eq(userProfilesTable.userId, userId))
    .returning();

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json({
    id: userId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    status: profile.status,
    customStatus: profile.customStatus,
    isSupporter: profile.isSupporter,
    isGrandfathered: profile.isGrandfathered,
    createdAt: profile.createdAt.toISOString(),
  });
});

// ─── Lookup user by username or email ────────────────────────────────────────
// GET /api/users/lookup?q=username_or_email
// Returns the user profile if found and not the current user, otherwise 404.
router.get("/users/lookup", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ error: "Query is required" });
    return;
  }

  const myId = req.user.id;

  // 1. Try exact username match (case-insensitive)
  let profile = await db.query.userProfilesTable.findFirst({
    where: ilike(userProfilesTable.username, q),
  });

  // 2. If not found, try looking up by email in the users table
  if (!profile) {
    const authUser = await db.query.usersTable.findFirst({
      where: ilike(usersTable.email, q),
    });
    if (authUser) {
      profile = await db.query.userProfilesTable.findFirst({
        where: eq(userProfilesTable.userId, authUser.id),
      });
    }
  }

  if (!profile) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Don't let users DM themselves
  if (profile.userId === myId) {
    res.status(400).json({ error: "That's you!" });
    return;
  }

  res.json({
    id: profile.userId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    status: profile.status,
  });
});

router.get("/users/:userId", async (req, res) => {
  const { userId } = req.params;
  const profile = await db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, userId) });
  if (!profile) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    id: userId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    status: profile.status,
    customStatus: profile.customStatus,
    isSupporter: profile.isSupporter,
    isGrandfathered: profile.isGrandfathered,
    createdAt: profile.createdAt.toISOString(),
  });
});

export default router;
