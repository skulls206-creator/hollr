import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { messagesTable, attachmentsTable, serverMembersTable, channelsTable, userProfilesTable, usersTable, messageReactionsTable } from "@workspace/db/schema";
import { eq, and, lt, desc, sql as drizzleSql } from "drizzle-orm";
import { SendMessageBody, EditMessageBody } from "@workspace/api-zod";
import { broadcast } from "../lib/ws";
import { sendPushToUser, getNotifPrefs } from "../lib/push";

const router: IRouter = Router();
const MAX_LIMIT = 50;

async function formatMessage(msg: typeof messagesTable.$inferSelect, viewerUserId?: string) {
  const [attachments, author, rawUser, reactions] = await Promise.all([
    db.query.attachmentsTable.findMany({ where: eq(attachmentsTable.messageId, msg.id) }),
    db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, msg.authorId) }),
    (async () => {
      const profile = await db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.userId, msg.authorId) });
      return profile ? null : db.query.usersTable.findFirst({ where: eq(usersTable.id, msg.authorId) });
    })(),
    db.select({
      emojiId: messageReactionsTable.emojiId,
      count: drizzleSql<number>`count(*)::int`,
    })
      .from(messageReactionsTable)
      .where(eq(messageReactionsTable.messageId, msg.id))
      .groupBy(messageReactionsTable.emojiId),
  ]);

  // Per-user reactions for reactedByCurrentUser flag
  let userReactionEmojis = new Set<string>();
  if (viewerUserId && reactions.length > 0) {
    const userRxns = await db.query.messageReactionsTable.findMany({
      where: and(
        eq(messageReactionsTable.messageId, msg.id),
        eq(messageReactionsTable.userId, viewerUserId)
      ),
    });
    userReactionEmojis = new Set(userRxns.map(r => r.emojiId));
  }

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

  const sortedReactions = reactions
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map(r => ({
      emojiId: r.emojiId,
      count: r.count,
      reactedByCurrentUser: userReactionEmojis.has(r.emojiId),
    }));

  let mentionsList: any[] = [];
  try { mentionsList = JSON.parse(msg.mentions || "[]"); } catch {}

  return {
    id: msg.id,
    content: msg.deleted ? '' : msg.content,
    authorId: msg.authorId,
    channelId: msg.channelId,
    dmThreadId: msg.dmThreadId,
    parentMessageId: msg.parentMessageId ?? null,
    replyCount: msg.replyCount ?? 0,
    edited: msg.edited,
    deleted: msg.deleted,
    pinned: msg.pinned,
    pinnedBy: msg.pinnedBy ?? null,
    mentions: mentionsList,
    reactions: sortedReactions,
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

// List messages
router.get("/channels/:channelId/messages", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const channel = await db.query.channelsTable.findFirst({ where: eq(channelsTable.id, req.params.channelId) });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, channel.serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  const limit = Math.min(Number(req.query.limit) || MAX_LIMIT, 100);
  const before = req.query.before as string | undefined;

  const whereClause = before
    ? and(
        eq(messagesTable.channelId, req.params.channelId),
        lt(messagesTable.id, before),
        drizzleSql`${messagesTable.parentMessageId} is null`
      )
    : and(
        eq(messagesTable.channelId, req.params.channelId),
        drizzleSql`${messagesTable.parentMessageId} is null`
      );

  const messages = await db.query.messagesTable.findMany({
    where: whereClause,
    orderBy: (m, { desc }) => [desc(m.createdAt)],
    limit,
  });

  const formatted = await Promise.all(messages.map(m => formatMessage(m, req.user.id)));
  res.json(formatted.reverse());
});

// Send message
router.post("/channels/:channelId/messages", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const channel = await db.query.channelsTable.findFirst({ where: eq(channelsTable.id, req.params.channelId) });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, channel.serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [msg] = await db.insert(messagesTable).values({
    content: parsed.data.content,
    authorId: req.user.id,
    channelId: req.params.channelId,
    mentions: parsed.data.mentions ? JSON.stringify(parsed.data.mentions) : "[]",
  }).returning();

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

  const formatted = await formatMessage(msg, req.user.id);
  broadcast({ type: "MESSAGE_CREATE", payload: formatted });
  res.status(201).json(formatted);

  // Fire-and-forget push notifications to other server members
  (async () => {
    try {
      const members = await db.query.serverMembersTable.findMany({
        where: eq(serverMembersTable.serverId, channel.serverId),
      });
      const senderProfile = await db.query.userProfilesTable.findFirst({
        where: eq(userProfilesTable.userId, req.user.id),
      });
      const senderName = senderProfile?.displayName || senderProfile?.username || "Someone";
      const body = parsed.data.content
        ? parsed.data.content.slice(0, 100)
        : "Sent an attachment";

      await Promise.allSettled(
        members
          .filter((m) => m.userId !== req.user.id)
          .map(async (m) => {
            const prefs = await getNotifPrefs(m.userId);
            if (prefs.mutedChannelIds.includes(req.params.channelId)) return;
            const navParams = new URLSearchParams({
              navType: "channel",
              serverId: channel.serverId,
              channelId: req.params.channelId,
            });
            await sendPushToUser(m.userId, {
              title: `${senderName} in #${channel.name}`,
              body,
              icon: senderProfile?.avatarUrl || "/images/icon-192.png",
              url: `/app?${navParams.toString()}`,
              tag: `channel-${req.params.channelId}`,
              nav: { type: "channel", serverId: channel.serverId, channelId: req.params.channelId },
            });
          })
      );
    } catch {}
  })();
});

// Edit message
router.patch("/channels/:channelId/messages/:messageId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const msg = await db.query.messagesTable.findFirst({ where: eq(messagesTable.id, req.params.messageId) });
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }
  if (msg.authorId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = EditMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [updated] = await db
    .update(messagesTable)
    .set({ content: parsed.data.content, edited: true })
    .where(eq(messagesTable.id, req.params.messageId))
    .returning();

  const formatted = await formatMessage(updated, req.user.id);
  broadcast({ type: "MESSAGE_UPDATE", payload: formatted });
  res.json(formatted);
});

// Delete message (soft delete — replaces content with tombstone)
router.delete("/channels/:channelId/messages/:messageId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const msg = await db.query.messagesTable.findFirst({ where: eq(messagesTable.id, req.params.messageId) });
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }
  if (msg.authorId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db
    .update(messagesTable)
    .set({ deleted: true, edited: false })
    .where(eq(messagesTable.id, req.params.messageId))
    .returning();

  const formatted = await formatMessage(updated, req.user.id);
  broadcast({ type: "MESSAGE_UPDATE", payload: formatted });
  res.json(formatted);
});

// GET pinned messages
router.get("/channels/:channelId/pinned-messages", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const channel = await db.query.channelsTable.findFirst({ where: eq(channelsTable.id, req.params.channelId) });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, channel.serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  const messages = await db.query.messagesTable.findMany({
    where: and(eq(messagesTable.channelId, req.params.channelId), eq(messagesTable.pinned, true)),
    orderBy: (m, { desc }) => [desc(m.updatedAt)],
  });

  const formatted = await Promise.all(messages.map(m => formatMessage(m, req.user.id)));
  res.json(formatted);
});

// PIN message (admin/owner only)
router.put("/channels/:channelId/messages/:messageId/pin", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const channel = await db.query.channelsTable.findFirst({ where: eq(channelsTable.id, req.params.channelId) });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, channel.serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }
  if (member.role !== "owner" && member.role !== "admin") {
    res.status(403).json({ error: "Only admins and the server owner can pin messages" });
    return;
  }

  const msg = await db.query.messagesTable.findFirst({
    where: and(eq(messagesTable.id, req.params.messageId), eq(messagesTable.channelId, req.params.channelId)),
  });
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db
    .update(messagesTable)
    .set({ pinned: true, pinnedBy: req.user.id })
    .where(eq(messagesTable.id, req.params.messageId))
    .returning();

  const formatted = await formatMessage(updated, req.user.id);
  broadcast({ type: "MESSAGE_UPDATE", payload: formatted });
  res.json(formatted);
});

// UNPIN message (admin/owner only)
router.delete("/channels/:channelId/messages/:messageId/pin", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const channel = await db.query.channelsTable.findFirst({ where: eq(channelsTable.id, req.params.channelId) });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, channel.serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }
  if (member.role !== "owner" && member.role !== "admin") {
    res.status(403).json({ error: "Only admins and the server owner can unpin messages" });
    return;
  }

  const msg = await db.query.messagesTable.findFirst({
    where: and(eq(messagesTable.id, req.params.messageId), eq(messagesTable.channelId, req.params.channelId)),
  });
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db
    .update(messagesTable)
    .set({ pinned: false, pinnedBy: null })
    .where(eq(messagesTable.id, req.params.messageId))
    .returning();

  const formatted = await formatMessage(updated, req.user.id);
  broadcast({ type: "MESSAGE_UPDATE", payload: formatted });
  res.json(formatted);
});

// Search messages
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

  const formatted = await Promise.all(messages.map(m => formatMessage(m, req.user.id)));
  res.json(formatted);
});

// TOGGLE reaction (PUT = add, DELETE = remove)
router.put("/channels/:channelId/messages/:messageId/reactions/:emojiId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { messageId, emojiId } = req.params;
  const decodedEmoji = decodeURIComponent(emojiId);

  const existing = await db.query.messageReactionsTable.findFirst({
    where: and(
      eq(messageReactionsTable.messageId, messageId),
      eq(messageReactionsTable.userId, req.user.id),
      eq(messageReactionsTable.emojiId, decodedEmoji)
    ),
  });

  if (existing) {
    await db.delete(messageReactionsTable).where(eq(messageReactionsTable.id, existing.id));
  } else {
    await db.insert(messageReactionsTable).values({
      messageId,
      userId: req.user.id,
      emojiId: decodedEmoji,
    });
  }

  const msg = await db.query.messagesTable.findFirst({ where: eq(messagesTable.id, messageId) });
  if (msg) {
    const formatted = await formatMessage(msg, req.user.id);
    broadcast({ type: "MESSAGE_UPDATE", payload: formatted });
    res.json(formatted);
  } else {
    res.status(404).json({ error: "Message not found" });
  }
});

// GET thread replies
router.get("/channels/:channelId/messages/:messageId/thread", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const channel = await db.query.channelsTable.findFirst({ where: eq(channelsTable.id, req.params.channelId) });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, channel.serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  const rootMsg = await db.query.messagesTable.findFirst({ where: eq(messagesTable.id, req.params.messageId) });
  if (!rootMsg) { res.status(404).json({ error: "Not found" }); return; }

  const replies = await db.query.messagesTable.findMany({
    where: eq(messagesTable.parentMessageId, req.params.messageId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });

  const [formattedRoot, formattedReplies] = await Promise.all([
    formatMessage(rootMsg, req.user.id),
    Promise.all(replies.map(m => formatMessage(m, req.user.id))),
  ]);

  res.json({ root: formattedRoot, replies: formattedReplies });
});

// POST thread reply
router.post("/channels/:channelId/messages/:messageId/thread", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const channel = await db.query.channelsTable.findFirst({ where: eq(channelsTable.id, req.params.channelId) });
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return; }

  const member = await db.query.serverMembersTable.findFirst({
    where: and(eq(serverMembersTable.serverId, channel.serverId), eq(serverMembersTable.userId, req.user.id)),
  });
  if (!member) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const parentId = req.params.messageId;

  const [reply] = await db.insert(messagesTable).values({
    content: parsed.data.content,
    authorId: req.user.id,
    channelId: req.params.channelId,
    parentMessageId: parentId,
  }).returning();

  // Increment parent replyCount
  await db.update(messagesTable)
    .set({ replyCount: drizzleSql`${messagesTable.replyCount} + 1` })
    .where(eq(messagesTable.id, parentId));

  const [formattedReply, updatedParent] = await Promise.all([
    formatMessage(reply, req.user.id),
    (async () => {
      const p = await db.query.messagesTable.findFirst({ where: eq(messagesTable.id, parentId) });
      return p ? formatMessage(p, req.user.id) : null;
    })(),
  ]);

  // Broadcast the reply and the updated parent (with incremented replyCount)
  broadcast({ type: "THREAD_REPLY_CREATE", payload: { reply: formattedReply, parentMessageId: parentId } });
  if (updatedParent) broadcast({ type: "MESSAGE_UPDATE", payload: updatedParent });

  res.status(201).json(formattedReply);
});

export default router;
