import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { channelsTable, serverMembersTable, channelReadsTable, messagesTable } from "@workspace/db/schema";
import { eq, and, gt, count, sql as drizzleSql } from "drizzle-orm";
import { CreateChannelBody, UpdateChannelBody } from "@workspace/api-zod";

const router: IRouter = Router();

async function isMember(userId: string, serverId: string) {
  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, serverId), eq(serverMembersTable.userId, userId)),
  });
  return member ?? null;
}

router.get("/servers/:serverId/channels", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const member = await isMember(req.user.id, req.params.serverId);
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  const channels = await db.query.channelsTable.findMany({
    where: eq(channelsTable.serverId, req.params.serverId),
    orderBy: (c, { asc }) => [asc(c.position)],
  });

  res.json(channels.map((c) => ({
    id: c.id,
    serverId: c.serverId,
    name: c.name,
    topic: c.topic,
    type: c.type,
    position: c.position,
    nsfw: c.nsfw,
    createdAt: c.createdAt.toISOString(),
  })));
});

router.post("/servers/:serverId/channels", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const member = await isMember(req.user.id, req.params.serverId);
  if (!member || member.role === "member") { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = CreateChannelBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await db.query.channelsTable.findMany({
    where: eq(channelsTable.serverId, req.params.serverId),
  });

  const [channel] = await db
    .insert(channelsTable)
    .values({
      serverId: req.params.serverId,
      name: parsed.data.name,
      topic: parsed.data.topic ?? null,
      type: parsed.data.type,
      position: existing.length,
    })
    .returning();

  res.status(201).json({
    id: channel.id,
    serverId: channel.serverId,
    name: channel.name,
    topic: channel.topic,
    type: channel.type,
    position: channel.position,
    nsfw: channel.nsfw,
    createdAt: channel.createdAt.toISOString(),
  });
});

router.patch("/servers/:serverId/channels/:channelId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const member = await isMember(req.user.id, req.params.serverId);
  if (!member || member.role === "member") { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateChannelBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [channel] = await db
    .update(channelsTable)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.topic !== undefined ? { topic: parsed.data.topic } : {}),
      ...(parsed.data.nsfw !== undefined ? { nsfw: parsed.data.nsfw } : {}),
    })
    .where(and(eq(channelsTable.id, req.params.channelId), eq(channelsTable.serverId, req.params.serverId)))
    .returning();

  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  res.json({
    id: channel.id,
    serverId: channel.serverId,
    name: channel.name,
    topic: channel.topic,
    type: channel.type,
    position: channel.position,
    nsfw: channel.nsfw,
    createdAt: channel.createdAt.toISOString(),
  });
});

router.delete("/servers/:serverId/channels/:channelId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const member = await isMember(req.user.id, req.params.serverId);
  if (!member || member.role === "member") { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(channelsTable).where(and(eq(channelsTable.id, req.params.channelId), eq(channelsTable.serverId, req.params.serverId)));
  res.json({ success: true });
});

// Mark a channel as read — upserts the lastReadAt timestamp for the current user
router.post("/channels/:channelId/read", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { channelId } = req.params;
  const userId = req.user.id;

  // Verify the channel exists and the caller is a member of its server
  const channel = await db.query.channelsTable.findFirst({ where: eq(channelsTable.id, channelId) });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }
  const member = await isMember(userId, channel.serverId);
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  await db
    .insert(channelReadsTable)
    .values({ userId, channelId, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [channelReadsTable.userId, channelReadsTable.channelId],
      set: { lastReadAt: new Date() },
    });

  res.json({ success: true });
});

// Get unread message counts per channel for the authenticated user's server channels
router.get("/servers/:serverId/unread", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const userId = req.user.id;
  const { serverId } = req.params;

  const member = await isMember(userId, serverId);
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  // Get all text channels for this server
  const channels = await db.query.channelsTable.findMany({
    where: and(eq(channelsTable.serverId, serverId), eq(channelsTable.type, "text")),
  });

  // Get existing read records for this user
  const reads = await db.query.channelReadsTable.findMany({
    where: eq(channelReadsTable.userId, userId),
  });
  const readMap = new Map(reads.map(r => [r.channelId, r.lastReadAt]));

  // Count unread messages per channel
  const result: { channelId: string; count: number }[] = [];
  for (const ch of channels) {
    const lastReadAt = readMap.get(ch.id);
    if (!lastReadAt) {
      // Never read — count all messages
      const [row] = await db
        .select({ c: count() })
        .from(messagesTable)
        .where(and(eq(messagesTable.channelId, ch.id), eq(messagesTable.deleted, false)));
      result.push({ channelId: ch.id, count: row?.c ?? 0 });
    } else {
      const [row] = await db
        .select({ c: count() })
        .from(messagesTable)
        .where(and(
          eq(messagesTable.channelId, ch.id),
          eq(messagesTable.deleted, false),
          gt(messagesTable.createdAt, lastReadAt),
        ));
      result.push({ channelId: ch.id, count: row?.c ?? 0 });
    }
  }

  res.json(result.filter(r => r.count > 0));
});

export default router;
