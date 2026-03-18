import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { messagesTable, attachmentsTable, serverMembersTable, channelsTable, userProfilesTable, usersTable } from "@workspace/db/schema";
import { eq, and, lt, desc } from "drizzle-orm";
import { SendMessageBody, EditMessageBody } from "@workspace/api-zod";
import { broadcast } from "../lib/ws";

const router: IRouter = Router();

const MAX_LIMIT = 50;

async function formatMessage(msg: typeof messagesTable.$inferSelect) {
  const attachments = await db.query.attachmentsTable.findMany({
    where: eq(attachmentsTable.messageId, msg.id),
  });
  const author = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, msg.authorId),
  });

  // Fallback: read raw user row so we always have firstName/lastName
  const rawUser = !author
    ? await db.query.usersTable.findFirst({ where: eq(usersTable.id, msg.authorId) })
    : null;

  const authorData = author ? {
    id: msg.authorId,
    username: author.username,
    displayName: author.displayName,
    avatarUrl: author.avatarUrl,
    status: author.status,
    customStatus: author.customStatus,
    createdAt: author.createdAt.toISOString(),
  } : {
    id: msg.authorId,
    username: `user_${msg.authorId.slice(0, 8)}`,
    displayName: rawUser
      ? [rawUser.firstName, rawUser.lastName].filter(Boolean).join(" ") || `User_${msg.authorId.slice(0, 6)}`
      : `User_${msg.authorId.slice(0, 6)}`,
    avatarUrl: rawUser?.profileImageUrl ?? null,
    status: "offline" as const,
    customStatus: null,
    createdAt: msg.createdAt.toISOString(),
  };

  return {
    id: msg.id,
    content: msg.content,
    authorId: msg.authorId,
    channelId: msg.channelId,
    dmThreadId: msg.dmThreadId,
    edited: msg.edited,
    pinned: msg.pinned,
    pinnedBy: msg.pinnedBy ?? null,
    attachments: attachments.map((a) => ({
      id: a.id,
      objectPath: a.objectPath,
      name: a.name,
      contentType: a.contentType,
      size: a.size,
    })),
    author: authorData,
    createdAt: msg.createdAt.toISOString(),
    updatedAt: msg.updatedAt.toISOString(),
  };
}

router.get("/channels/:channelId/messages", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const channel = await db.query.channelsTable.findFirst({
    where: eq(channelsTable.id, req.params.channelId),
  });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, channel.serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  const limit = Math.min(Number(req.query.limit) || MAX_LIMIT, 100);
  const before = req.query.before as string | undefined;

  const whereClause = before
    ? and(eq(messagesTable.channelId, req.params.channelId), lt(messagesTable.id, before))
    : eq(messagesTable.channelId, req.params.channelId);

  const messages = await db.query.messagesTable.findMany({
    where: whereClause,
    orderBy: (m, { desc }) => [desc(m.createdAt)],
    limit,
  });

  const formatted = await Promise.all(messages.map(formatMessage));
  res.json(formatted.reverse());
});

router.post("/channels/:channelId/messages", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const channel = await db.query.channelsTable.findFirst({
    where: eq(channelsTable.id, req.params.channelId),
  });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, channel.serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [msg] = await db
    .insert(messagesTable)
    .values({
      content: parsed.data.content,
      authorId: req.user.id,
      channelId: req.params.channelId,
    })
    .returning();

  if (parsed.data.attachments?.length) {
    await db.insert(attachmentsTable).values(
      parsed.data.attachments.map((a) => ({
        messageId: msg.id,
        objectPath: a.objectPath,
        name: a.name,
        contentType: a.contentType,
        size: a.size,
      }))
    );
  }

  const formatted = await formatMessage(msg);
  broadcast({ type: "MESSAGE_CREATE", payload: formatted });
  res.status(201).json(formatted);
});

router.patch("/channels/:channelId/messages/:messageId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const msg = await db.query.messagesTable.findFirst({
    where: eq(messagesTable.id, req.params.messageId),
  });
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }
  if (msg.authorId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = EditMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db
    .update(messagesTable)
    .set({ content: parsed.data.content, edited: true })
    .where(eq(messagesTable.id, req.params.messageId))
    .returning();

  const formatted = await formatMessage(updated);
  broadcast({ type: "MESSAGE_UPDATE", payload: formatted });
  res.json(formatted);
});

router.delete("/channels/:channelId/messages/:messageId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const msg = await db.query.messagesTable.findFirst({
    where: eq(messagesTable.id, req.params.messageId),
  });
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }
  if (msg.authorId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(messagesTable).where(eq(messagesTable.id, req.params.messageId));
  broadcast({ type: "MESSAGE_DELETE", payload: { id: req.params.messageId, channelId: req.params.channelId } });
  res.json({ success: true });
});

// GET pinned messages for a channel
router.get("/channels/:channelId/pinned-messages", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const channel = await db.query.channelsTable.findFirst({
    where: eq(channelsTable.id, req.params.channelId),
  });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, channel.serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  const messages = await db.query.messagesTable.findMany({
    where: and(eq(messagesTable.channelId, req.params.channelId), eq(messagesTable.pinned, true)),
    orderBy: (m, { desc }) => [desc(m.updatedAt)],
  });

  const formatted = await Promise.all(messages.map(formatMessage));
  res.json(formatted);
});

// PIN a message
router.put("/channels/:channelId/messages/:messageId/pin", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const channel = await db.query.channelsTable.findFirst({
    where: eq(channelsTable.id, req.params.channelId),
  });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, channel.serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  const msg = await db.query.messagesTable.findFirst({
    where: and(eq(messagesTable.id, req.params.messageId), eq(messagesTable.channelId, req.params.channelId)),
  });
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db
    .update(messagesTable)
    .set({ pinned: true, pinnedBy: req.user.id })
    .where(eq(messagesTable.id, req.params.messageId))
    .returning();

  const formatted = await formatMessage(updated);
  broadcast({ type: "MESSAGE_UPDATE", payload: formatted });
  res.json(formatted);
});

// UNPIN a message
router.delete("/channels/:channelId/messages/:messageId/pin", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const channel = await db.query.channelsTable.findFirst({
    where: eq(channelsTable.id, req.params.channelId),
  });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, channel.serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  const msg = await db.query.messagesTable.findFirst({
    where: and(eq(messagesTable.id, req.params.messageId), eq(messagesTable.channelId, req.params.channelId)),
  });
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db
    .update(messagesTable)
    .set({ pinned: false, pinnedBy: null })
    .where(eq(messagesTable.id, req.params.messageId))
    .returning();

  const formatted = await formatMessage(updated);
  broadcast({ type: "MESSAGE_UPDATE", payload: formatted });
  res.json(formatted);
});

router.get("/channels/:channelId/messages/search", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const q = String(req.query.q || "").trim();
  if (!q) { res.json([]); return; }

  const { ilike } = await import("drizzle-orm");
  const messages = await db.query.messagesTable.findMany({
    where: and(eq(messagesTable.channelId, req.params.channelId), ilike(messagesTable.content, `%${q}%`)),
    limit: 50,
    orderBy: (m, { desc }) => [desc(m.createdAt)],
  });

  const formatted = await Promise.all(messages.map(formatMessage));
  res.json(formatted);
});

export default router;
