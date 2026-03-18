import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { serversTable, serverMembersTable, channelsTable, userProfilesTable } from "@workspace/db/schema";
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

  res.json(servers.filter(Boolean).map((s) => ({
    id: s!.id,
    name: s!.name,
    description: s!.description,
    iconUrl: s!.iconUrl,
    ownerId: s!.ownerId,
    inviteCode: s!.inviteCode,
    memberCount: s!.memberCount,
    createdAt: s!.createdAt.toISOString(),
  })));
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

  // Create default channels
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
    memberCount: 1,
    createdAt: server.createdAt.toISOString(),
  });
});

router.get("/servers/:serverId", async (req, res) => {
  const server = await getServerWithCount(req.params.serverId);
  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return;
  }
  res.json({
    id: server.id,
    name: server.name,
    description: server.description,
    iconUrl: server.iconUrl,
    ownerId: server.ownerId,
    inviteCode: server.inviteCode,
    memberCount: server.memberCount,
    createdAt: server.createdAt.toISOString(),
  });
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

  const [updated] = await db
    .update(serversTable)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.iconUrl !== undefined ? { iconUrl: parsed.data.iconUrl } : {}),
    })
    .where(eq(serversTable.id, serverId))
    .returning();

  const result = await getServerWithCount(serverId);
  res.json({
    id: result!.id,
    name: result!.name,
    description: result!.description,
    iconUrl: result!.iconUrl,
    ownerId: result!.ownerId,
    inviteCode: result!.inviteCode,
    memberCount: result!.memberCount,
    createdAt: result!.createdAt.toISOString(),
  });
});

router.delete("/servers/:serverId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { serverId } = req.params;
  const server = await db.query.serversTable.findFirst({ where: eq(serversTable.id, serverId) });
  if (!server) { res.status(404).json({ error: "Not found" }); return; }
  if (server.ownerId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(serverMembersTable).where(eq(serverMembersTable.serverId, serverId));
  await db.delete(channelsTable).where(eq(channelsTable.serverId, serverId));
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

  const existing = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, server.id), eq(serverMembersTable.userId, req.user.id)),
  });

  if (!existing) {
    await db.insert(serverMembersTable).values({
      userId: req.user.id,
      serverId: server.id,
      role: "member",
    });
  }

  const result = await getServerWithCount(server.id);
  res.json({
    id: result!.id,
    name: result!.name,
    description: result!.description,
    iconUrl: result!.iconUrl,
    ownerId: result!.ownerId,
    inviteCode: result!.inviteCode,
    memberCount: result!.memberCount,
    createdAt: result!.createdAt.toISOString(),
  });
});

router.post("/servers/:serverId/leave", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db.delete(serverMembersTable).where(
    and(eq(serverMembersTable.serverId, req.params.serverId), eq(serverMembersTable.userId, req.user.id))
  );
  res.json({ success: true });
});

router.post("/servers/:serverId/invite", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { serverId } = req.params;
  const server = await db.query.serversTable.findFirst({ where: eq(serversTable.id, serverId) });
  if (!server) { res.status(404).json({ error: "Not found" }); return; }
  if (server.ownerId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }

  const newCode = generateInviteCode();
  await db.update(serversTable).set({ inviteCode: newCode }).where(eq(serversTable.id, serverId));
  res.json({ inviteCode: newCode });
});

router.get("/servers/:serverId/members", async (req, res) => {
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
    } : {
      id: member.userId,
      username: `user_${member.userId.slice(0, 8)}`,
      displayName: `User`,
      avatarUrl: null,
      status: "offline",
      customStatus: null,
      createdAt: member.joinedAt.toISOString(),
    },
  })));
});

export default router;
