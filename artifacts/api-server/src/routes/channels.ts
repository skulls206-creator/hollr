import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { channelsTable, serverMembersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
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
    })
    .where(eq(channelsTable.id, req.params.channelId))
    .returning();

  res.json({
    id: channel.id,
    serverId: channel.serverId,
    name: channel.name,
    topic: channel.topic,
    type: channel.type,
    position: channel.position,
    createdAt: channel.createdAt.toISOString(),
  });
});

router.delete("/servers/:serverId/channels/:channelId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const member = await isMember(req.user.id, req.params.serverId);
  if (!member || member.role === "member") { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(channelsTable).where(eq(channelsTable.id, req.params.channelId));
  res.json({ success: true });
});

export default router;
