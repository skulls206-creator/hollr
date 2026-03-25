import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { dmThreadsTable, dmParticipantsTable, messagesTable, attachmentsTable, userProfilesTable, messageReactionsTable } from "@workspace/db/schema";
import { eq, and, lt, inArray, sql as drizzleSql, ilike } from "drizzle-orm";
import { OpenDmThreadBody, SendMessageBody, EditMessageBody } from "@workspace/api-zod";
import { broadcast } from "../lib/ws";
import { sendPushToUser, getNotifPrefs } from "../lib/push";

const router: IRouter = Router();

async function formatUser(userId: string) {
  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });
  if (profile) {
    return {
      id: userId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      status: profile.status,
      customStatus: profile.customStatus,
      createdAt: profile.createdAt.toISOString(),
    };
  }
  return {
    id: userId,
    username: `user_${userId.slice(0, 8)}`,
    displayName: `User_${userId.slice(0, 6)}`,
    avatarUrl: null,
    status: "offline" as const,
    customStatus: null,
    createdAt: new Date().toISOString(),
  };
}

async function formatMessage(msg: typeof messagesTable.$inferSelect, viewerUserId?: string) {
  const [attachments, author, rawReactions] = await Promise.all([
    db.query.attachmentsTable.findMany({ where: eq(attachmentsTable.messageId, msg.id) }),
    formatUser(msg.authorId),
    db.select({
      emojiId: messageReactionsTable.emojiId,
      count: drizzleSql<number>`count(*)::int`,
    })
      .from(messageReactionsTable)
      .where(eq(messageReactionsTable.messageId, msg.id))
      .groupBy(messageReactionsTable.emojiId),
  ]);

  let userReactionEmojis = new Set<string>();
  if (viewerUserId && rawReactions.length > 0) {
    const userRxns = await db.query.messageReactionsTable.findMany({
      where: and(
        eq(messageReactionsTable.messageId, msg.id),
        eq(messageReactionsTable.userId, viewerUserId)
      ),
    });
    userReactionEmojis = new Set(userRxns.map(r => r.emojiId));
  }

  const reactions = rawReactions
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map(r => ({
      emojiId: r.emojiId,
      count: r.count,
      reactedByCurrentUser: userReactionEmojis.has(r.emojiId),
    }));

  return {
    id: msg.id,
    content: msg.deleted ? "" : msg.content,
    authorId: msg.authorId,
    channelId: msg.channelId,
    dmThreadId: msg.dmThreadId,
    edited: msg.edited,
    deleted: msg.deleted ?? false,
    reactions,
    attachments: attachments.map((a) => ({
      id: a.id,
      objectPath: a.objectPath,
      name: a.name,
      contentType: a.contentType,
      size: a.size,
    })),
    author,
    createdAt: msg.createdAt.toISOString(),
    updatedAt: msg.updatedAt.toISOString(),
  };
}

async function formatThread(threadId: string) {
  const participants = await db.query.dmParticipantsTable.findMany({
    where: eq(dmParticipantsTable.threadId, threadId),
  });
  const thread = await db.query.dmThreadsTable.findFirst({
    where: eq(dmThreadsTable.id, threadId),
  });
  if (!thread) return null;

  const lastMsgRow = await db.query.messagesTable.findFirst({
    where: eq(messagesTable.dmThreadId, threadId),
    orderBy: (m, { desc }) => [desc(m.createdAt)],
  });

  const participantUsers = await Promise.all(participants.map((p) => formatUser(p.userId)));
  const lastMessage = lastMsgRow ? await formatMessage(lastMsgRow) : null;

  return {
    id: thread.id,
    participants: participantUsers,
    lastMessage,
    createdAt: thread.createdAt.toISOString(),
  };
}

// ─── List DM threads ──────────────────────────────────────────────────────────
router.get("/dms", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const participations = await db.query.dmParticipantsTable.findMany({
    where: eq(dmParticipantsTable.userId, req.user.id),
  });

  const threads = await Promise.all(participations.map((p) => formatThread(p.threadId)));
  res.json(threads.filter(Boolean));
});

// ─── Search DM messages (across all threads) ─────────────────────────────────
router.get("/dms/search", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const q = String(req.query.q || "").trim();
  if (q.length < 2) { res.json([]); return; }

  // Get all thread IDs this user participates in
  const participations = await db.query.dmParticipantsTable.findMany({
    where: eq(dmParticipantsTable.userId, req.user.id),
  });
  const threadIds = participations.map((p) => p.threadId);
  if (threadIds.length === 0) { res.json([]); return; }

  // Search messages across all these threads
  const messages = await db.query.messagesTable.findMany({
    where: and(inArray(messagesTable.dmThreadId, threadIds), ilike(messagesTable.content, `%${q}%`)),
    limit: 50,
    orderBy: (m, { desc }) => [desc(m.createdAt)],
  });

  // Group results by thread
  const grouped: Record<string, { threadId: string; messages: any[] }> = {};
  await Promise.all(messages.map(async (msg) => {
    const tid = msg.dmThreadId!;
    if (!grouped[tid]) grouped[tid] = { threadId: tid, messages: [] };
    grouped[tid].messages.push(await formatMessage(msg, req.user.id));
  }));

  // Attach thread/participant info
  const results = await Promise.all(Object.values(grouped).map(async (g) => {
    const thread = await formatThread(g.threadId);
    return { thread, messages: g.messages };
  }));

  res.json(results.filter(r => r.thread));
});

// ─── Open / create DM thread ─────────────────────────────────────────────────
router.post("/dms", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = OpenDmThreadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const otherUserId = parsed.data.userId;
  const myId = req.user.id;

  const myThreads = await db.query.dmParticipantsTable.findMany({
    where: eq(dmParticipantsTable.userId, myId),
  });
  const myThreadIds = myThreads.map((p) => p.threadId);

  if (myThreadIds.length > 0) {
    const otherThreads = await db.query.dmParticipantsTable.findMany({
      where: and(eq(dmParticipantsTable.userId, otherUserId), inArray(dmParticipantsTable.threadId, myThreadIds)),
    });
    if (otherThreads.length > 0) {
      const thread = await formatThread(otherThreads[0].threadId);
      res.json(thread);
      return;
    }
  }

  const [thread] = await db.insert(dmThreadsTable).values({}).returning();
  await db.insert(dmParticipantsTable).values([
    { threadId: thread.id, userId: myId },
    { threadId: thread.id, userId: otherUserId },
  ]);

  const formatted = await formatThread(thread.id);
  res.json(formatted);
});

// ─── List DM messages ─────────────────────────────────────────────────────────
router.get("/dms/:threadId/messages", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const participant = await db.query.dmParticipantsTable.findFirst({
    where: and(eq(dmParticipantsTable.threadId, req.params.threadId), eq(dmParticipantsTable.userId, req.user.id)),
  });
  if (!participant) { res.status(403).json({ error: "Forbidden" }); return; }

  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = req.query.before as string | undefined;

  const whereClause = before
    ? and(eq(messagesTable.dmThreadId, req.params.threadId), lt(messagesTable.id, before))
    : eq(messagesTable.dmThreadId, req.params.threadId);

  const messages = await db.query.messagesTable.findMany({
    where: whereClause,
    orderBy: (m, { desc }) => [desc(m.createdAt)],
    limit,
  });

  const formatted = await Promise.all(messages.map(m => formatMessage(m, req.user.id)));
  res.json(formatted.reverse());
});

// ─── Send DM message ─────────────────────────────────────────────────────────
router.post("/dms/:threadId/messages", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const participant = await db.query.dmParticipantsTable.findFirst({
    where: and(eq(dmParticipantsTable.threadId, req.params.threadId), eq(dmParticipantsTable.userId, req.user.id)),
  });
  if (!participant) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [msg] = await db
    .insert(messagesTable)
    .values({
      content: parsed.data.content,
      authorId: req.user.id,
      dmThreadId: req.params.threadId,
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

  const formatted = await formatMessage(msg, req.user.id);
  broadcast({ type: "MESSAGE_CREATE", payload: formatted });
  res.status(201).json(formatted);

  (async () => {
    try {
      const participants = await db.query.dmParticipantsTable.findMany({
        where: eq(dmParticipantsTable.threadId, req.params.threadId),
      });
      const senderProfile = await db.query.userProfilesTable.findFirst({
        where: eq(userProfilesTable.userId, req.user.id),
      });
      const senderName = senderProfile?.displayName || senderProfile?.username || "Someone";
      const body = parsed.data.content ? parsed.data.content.slice(0, 100) : "Sent a message";

      await Promise.allSettled(
        participants
          .filter((p) => p.userId !== req.user.id)
          .map(async (p) => {
            const prefs = await getNotifPrefs(p.userId);
            if (prefs.muteDms) return;
            const navParams = new URLSearchParams({
              navType: "dm",
              threadId: req.params.threadId,
            });
            await sendPushToUser(p.userId, {
              title: `${senderName} (DM)`,
              body,
              icon: senderProfile?.avatarUrl || "/images/icon-192.png",
              url: `/app?${navParams.toString()}`,
              tag: `dm-${req.params.threadId}`,
              nav: { type: "dm", threadId: req.params.threadId },
            });
          })
      );
    } catch {}
  })();
});

// ─── Edit DM message ──────────────────────────────────────────────────────────
router.patch("/dms/:threadId/messages/:messageId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const participant = await db.query.dmParticipantsTable.findFirst({
    where: and(eq(dmParticipantsTable.threadId, req.params.threadId), eq(dmParticipantsTable.userId, req.user.id)),
  });
  if (!participant) { res.status(403).json({ error: "Forbidden" }); return; }

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

// ─── Delete DM message (soft delete) ─────────────────────────────────────────
router.delete("/dms/:threadId/messages/:messageId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const participant = await db.query.dmParticipantsTable.findFirst({
    where: and(eq(dmParticipantsTable.threadId, req.params.threadId), eq(dmParticipantsTable.userId, req.user.id)),
  });
  if (!participant) { res.status(403).json({ error: "Forbidden" }); return; }

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

// ─── Toggle reaction on DM message ───────────────────────────────────────────
router.put("/dms/:threadId/messages/:messageId/reactions/:emojiId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const participant = await db.query.dmParticipantsTable.findFirst({
    where: and(eq(dmParticipantsTable.threadId, req.params.threadId), eq(dmParticipantsTable.userId, req.user.id)),
  });
  if (!participant) { res.status(403).json({ error: "Forbidden" }); return; }

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
  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }

  const formatted = await formatMessage(msg, req.user.id);
  broadcast({ type: "MESSAGE_UPDATE", payload: formatted });
  res.json(formatted);
});

export default router;
