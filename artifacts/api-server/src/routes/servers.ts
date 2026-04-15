import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { serversTable, serverMembersTable, serverBansTable, channelsTable, userProfilesTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { CreateServerBody, UpdateServerBody, JoinServerBody } from "@workspace/api-zod";
import { broadcast } from "../lib/ws";
import crypto from "crypto";

const router: IRouter = Router();

function generateInviteCode() {
  return crypto.randomBytes(6).toString("base64url");
}

async function getServerWithCount(serverId: string) {
  const server = await db.query.serversTable.findFirst({
    where: eq(serversTable.id, serverId),
  });
  if (!server) return null;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(serverMembersTable)
    .where(eq(serverMembersTable.serverId, serverId));

  return { ...server, memberCount: count };
}

function formatServer(s: NonNullable<Awaited<ReturnType<typeof getServerWithCount>>>) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    iconUrl: s.iconUrl,
    ownerId: s.ownerId,
    inviteCode: s.inviteCode,
    inviteExpiresAt: s.inviteExpiresAt?.toISOString() ?? null,
    inviteMaxUses: s.inviteMaxUses ?? null,
    inviteUseCount: s.inviteUseCount,
    memberCount: s.memberCount,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/servers", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const memberships = await db.query.serverMembersTable.findMany({
    where: eq(serverMembersTable.userId, req.user.id),
  });

  const servers = await Promise.all(
    memberships.map((m) => getServerWithCount(m.serverId))
  );

  res.json(servers.filter(Boolean).map(s => formatServer(s!)));
});

router.post("/servers", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateServerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [server] = await db
    .insert(serversTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      iconUrl: parsed.data.iconUrl ?? null,
      ownerId: req.user.id,
      inviteCode: generateInviteCode(),
    })
    .returning();

  await db.insert(serverMembersTable).values({
    userId: req.user.id,
    serverId: server.id,
    role: "owner",
  });

  await db.insert(channelsTable).values([
    { serverId: server.id, name: "general", type: "text", position: 0 },
    { serverId: server.id, name: "General", type: "voice", position: 1 },
  ]);

  res.status(201).json({
    id: server.id,
    name: server.name,
    description: server.description,
    iconUrl: server.iconUrl,
    ownerId: server.ownerId,
    inviteCode: server.inviteCode,
    inviteExpiresAt: null,
    inviteMaxUses: null,
    inviteUseCount: 0,
    memberCount: 1,
    createdAt: server.createdAt.toISOString(),
  });
});

router.get("/servers/:serverId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const server = await getServerWithCount(req.params.serverId);
  if (!server) { res.status(404).json({ error: "Server not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, server.id), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  res.json(formatServer(server));
});

router.patch("/servers/:serverId", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { serverId } = req.params;
  const server = await db.query.serversTable.findFirst({ where: eq(serversTable.id, serverId) });
  if (!server) { res.status(404).json({ error: "Not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdateServerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  await db
    .update(serversTable)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.iconUrl !== undefined ? { iconUrl: parsed.data.iconUrl } : {}),
    })
    .where(eq(serversTable.id, serverId));

  const result = await getServerWithCount(serverId);
  res.json(formatServer(result!));
});

router.delete("/servers/:serverId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { serverId } = req.params;
  const server = await db.query.serversTable.findFirst({ where: eq(serversTable.id, serverId) });
  if (!server) { res.status(404).json({ error: "Not found" }); return; }
  if (server.ownerId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(serverMembersTable).where(eq(serverMembersTable.serverId, serverId));
  await db.delete(channelsTable).where(eq(channelsTable.serverId, serverId));
  await db.delete(serverBansTable).where(eq(serverBansTable.serverId, serverId));
  await db.delete(serversTable).where(eq(serversTable.id, serverId));

  res.json({ success: true });
});

router.post("/servers/:serverId/join", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = JoinServerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const server = await db.query.serversTable.findFirst({
    where: eq(serversTable.inviteCode, parsed.data.inviteCode),
  });
  if (!server) { res.status(404).json({ error: "Invalid invite code" }); return; }

  if (server.inviteExpiresAt && server.inviteExpiresAt < new Date()) {
    res.status(410).json({ error: "This invite link has expired." });
    return;
  }
  if (server.inviteMaxUses && server.inviteUseCount >= server.inviteMaxUses) {
    res.status(410).json({ error: "This invite link has reached its maximum uses." });
    return;
  }

  const ban = await db.query.serverBansTable.findFirst({
    where: and(eq(serverBansTable.serverId, server.id), eq(serverBansTable.userId, req.user.id)),
  });
  if (ban) {
    res.status(403).json({ error: "You are banned from this server." });
    return;
  }

  const existing = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, server.id), eq(serverMembersTable.userId, req.user.id)),
  });

  if (!existing) {
    await db.insert(serverMembersTable).values({
      userId: req.user.id,
      serverId: server.id,
      role: "member",
    });
    await db.update(serversTable)
      .set({ inviteUseCount: sql`${serversTable.inviteUseCount} + 1` })
      .where(eq(serversTable.id, server.id));
  }

  const result = await getServerWithCount(server.id);
  res.json(formatServer(result!));
});

router.get("/invite/:inviteCode", async (req, res) => {
  const server = await db.query.serversTable.findFirst({
    where: eq(serversTable.inviteCode, req.params.inviteCode),
  });
  if (!server) {
    res.status(404).json({ error: "Invalid invite code" });
    return;
  }

  if (server.inviteExpiresAt && server.inviteExpiresAt < new Date()) {
    res.status(410).json({ error: "This invite link has expired." });
    return;
  }
  if (server.inviteMaxUses && server.inviteUseCount >= server.inviteMaxUses) {
    res.status(410).json({ error: "This invite link has reached its maximum uses." });
    return;
  }

  const result = await getServerWithCount(server.id);
  res.json(formatServer(result!));
});

router.post("/invite/:inviteCode/join", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const server = await db.query.serversTable.findFirst({
    where: eq(serversTable.inviteCode, req.params.inviteCode),
  });
  if (!server) {
    res.status(404).json({ error: "Invalid invite code" });
    return;
  }

  if (server.inviteExpiresAt && server.inviteExpiresAt < new Date()) {
    res.status(410).json({ error: "This invite link has expired." });
    return;
  }
  if (server.inviteMaxUses && server.inviteUseCount >= server.inviteMaxUses) {
    res.status(410).json({ error: "This invite link has reached its maximum uses." });
    return;
  }

  const ban = await db.query.serverBansTable.findFirst({
    where: and(eq(serverBansTable.serverId, server.id), eq(serverBansTable.userId, req.user.id)),
  });
  if (ban) {
    res.status(403).json({ error: "You are banned from this server." });
    return;
  }

  const existing = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, server.id), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!existing) {
    await db.insert(serverMembersTable).values({ userId: req.user.id, serverId: server.id, role: "member" });
    await db.update(serversTable)
      .set({ inviteUseCount: sql`${serversTable.inviteUseCount} + 1` })
      .where(eq(serversTable.id, server.id));
  }
  const result = await getServerWithCount(server.id);
  res.json(formatServer(result!));
});

router.post("/servers/:serverId/transfer-ownership", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { serverId } = req.params;
  const { newOwnerId } = req.body as { newOwnerId?: string };
  if (!newOwnerId) { res.status(400).json({ error: "newOwnerId is required" }); return; }

  const server = await db.query.serversTable.findFirst({ where: eq(serversTable.id, serverId) });
  if (!server) { res.status(404).json({ error: "Not found" }); return; }
  if (server.ownerId !== req.user.id) {
    res.status(403).json({ error: "Only the server owner can transfer ownership" });
    return;
  }

  const newOwnerMember = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, newOwnerId)),
  });
  if (!newOwnerMember) { res.status(400).json({ error: "Target user is not a member of this server" }); return; }

  await db.transaction(async (tx) => {
    await tx.update(serversTable).set({ ownerId: newOwnerId }).where(eq(serversTable.id, serverId));
    await tx.update(serverMembersTable).set({ role: "owner" }).where(
      and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, newOwnerId))
    );
    await tx.update(serverMembersTable).set({ role: "admin" }).where(
      and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, req.user.id))
    );
  });

  const result = await getServerWithCount(serverId);
  res.json(formatServer(result!));
});

router.post("/servers/:serverId/leave", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db.delete(serverMembersTable).where(
    and(eq(serverMembersTable.serverId, req.params.serverId), eq(serverMembersTable.userId, req.user.id))
  );
  res.json({ success: true });
});

// Regenerate invite link with optional expiry/max uses
router.post("/servers/:serverId/invite", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { serverId } = req.params;
  const server = await db.query.serversTable.findFirst({ where: eq(serversTable.id, serverId) });
  if (!server) { res.status(404).json({ error: "Not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { expiresInHours, maxUses } = req.body as { expiresInHours?: number; maxUses?: number };
  const newCode = generateInviteCode();
  const inviteExpiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
    : null;

  await db.update(serversTable).set({
    inviteCode: newCode,
    inviteExpiresAt,
    inviteMaxUses: maxUses ?? null,
    inviteUseCount: 0,
  }).where(eq(serversTable.id, serverId));

  res.json({
    inviteCode: newCode,
    inviteExpiresAt: inviteExpiresAt?.toISOString() ?? null,
    inviteMaxUses: maxUses ?? null,
    inviteUseCount: 0,
  });
});

// Kick a member (owner/admin only, cannot kick owner)
router.delete("/servers/:serverId/members/:userId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { serverId, userId } = req.params;

  const actor = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const target = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, userId)),
  });
  if (!target) { res.status(404).json({ error: "Member not found" }); return; }
  if (target.role === "owner") { res.status(403).json({ error: "Cannot kick the server owner" }); return; }
  if (actor.role === "admin" && target.role === "admin") {
    res.status(403).json({ error: "Admins cannot kick other admins" });
    return;
  }

  await db.delete(serverMembersTable).where(
    and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, userId))
  );

  broadcast({ type: "MEMBER_KICKED", payload: { serverId, userId } });
  res.json({ success: true });
});

// Ban a member (owner/admin only)
router.post("/servers/:serverId/bans/:userId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { serverId, userId } = req.params;
  const { reason } = req.body as { reason?: string };

  const actor = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const target = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, userId)),
  });
  if (target?.role === "owner") { res.status(403).json({ error: "Cannot ban the server owner" }); return; }
  if (actor.role === "admin" && target?.role === "admin") {
    res.status(403).json({ error: "Admins cannot ban other admins" });
    return;
  }

  const alreadyBanned = await db.query.serverBansTable.findFirst({
    where: and(eq(serverBansTable.serverId, serverId), eq(serverBansTable.userId, userId)),
  });
  if (!alreadyBanned) {
    await db.insert(serverBansTable).values({
      serverId, userId, bannedBy: req.user.id, reason: reason ?? null,
    });
  }

  if (target) {
    await db.delete(serverMembersTable).where(
      and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, userId))
    );
  }

  broadcast({ type: "MEMBER_BANNED", payload: { serverId, userId } });
  res.json({ success: true });
});

// Unban a user (owner/admin only)
router.delete("/servers/:serverId/bans/:userId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { serverId, userId } = req.params;

  const actor = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(serverBansTable).where(
    and(eq(serverBansTable.serverId, serverId), eq(serverBansTable.userId, userId))
  );
  res.json({ success: true });
});

// List bans (owner/admin only)
router.get("/servers/:serverId/bans", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { serverId } = req.params;

  const actor = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!actor || (actor.role !== "owner" && actor.role !== "admin")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const bans = await db.query.serverBansTable.findMany({
    where: eq(serverBansTable.serverId, serverId),
  });

  const withProfiles = await Promise.all(bans.map(async (ban) => {
    const profile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.userId, ban.userId),
    });
    return {
      userId: ban.userId,
      reason: ban.reason,
      createdAt: ban.createdAt.toISOString(),
      user: profile ? {
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      } : null,
    };
  }));

  res.json(withProfiles);
});

router.get("/servers/:serverId/members", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const callerMembership = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, req.params.serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!callerMembership) { res.status(403).json({ error: "Forbidden" }); return; }
  const members = await db.query.serverMembersTable.findMany({
    where: eq(serverMembersTable.serverId, req.params.serverId),
  });

  const profiles = await Promise.all(
    members.map(async (m) => {
      const profile = await db.query.userProfilesTable.findFirst({
        where: eq(userProfilesTable.userId, m.userId),
      });
      return { member: m, profile };
    })
  );

  res.json(profiles.map(({ member, profile }) => ({
    userId: member.userId,
    serverId: member.serverId,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
    user: profile ? {
      id: member.userId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      status: profile.status,
      customStatus: profile.customStatus,
      createdAt: profile.createdAt.toISOString(),
      isSupporter: profile.isSupporter,
      isGrandfathered: profile.isGrandfathered,
    } : {
      id: member.userId,
      username: `user_${member.userId.slice(0, 8)}`,
      displayName: `User`,
      avatarUrl: null,
      status: "offline",
      customStatus: null,
      createdAt: member.joinedAt.toISOString(),
      isSupporter: false,
      isGrandfathered: false,
    },
  })));
});

export default router;
