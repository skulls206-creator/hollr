import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { userProfilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
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
    createdAt: profile.createdAt.toISOString(),
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
    createdAt: profile.createdAt.toISOString(),
  });
});

export default router;
