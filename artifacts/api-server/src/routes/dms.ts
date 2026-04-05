import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { dmThreadsTable, dmParticipantsTable, messagesTable, attachmentsTable, userProfilesTable, messageReactionsTable, dmCallSignalsTable } from "@workspace/db/schema";
import { eq, and, lt, inArray, sql as drizzleSql, ilike, isNull, desc, asc, gt } from "drizzle-orm";
import { OpenDmThreadBody, SendMessageBody, EditMessageBody } from "@workspace/api-zod";
import { broadcast, sendToUser, sendNotification } from "../lib/ws";
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
      isSupporter: profile.isSupporter,
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
    isSupporter: false,
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
    metadata: msg.metadata ?? null,
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

// ─── Close (leave) a DM thread ────────────────────────────────────────────────
router.delete("/dms/:threadId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { threadId } = req.params;
  const participant = await db.query.dmParticipantsTable.findFirst({
    where: and(eq(dmParticipantsTable.threadId, threadId), eq(dmParticipantsTable.userId, req.user.id)),
  });
  if (!participant) { res.status(404).json({ error: "Thread not found" }); return; }

  await db.delete(dmParticipantsTable)
    .where(and(eq(dmParticipantsTable.threadId, threadId), eq(dmParticipantsTable.userId, req.user.id)));

  res.json({ ok: true });
});

// ─── Get DM unread counts (must be before /:threadId routes) ─────────────────
router.get("/dms/unread", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const participations = await db.query.dmParticipantsTable.findMany({
    where: eq(dmParticipantsTable.userId, req.user.id),
  });

  const userId = req.user.id;
  const counts = await Promise.all(participations.map(async (p) => {
    let count = 0;
    if (p.lastReadAt) {
      const rows = await db.query.messagesTable.findMany({
        where: and(
          eq(messagesTable.dmThreadId, p.threadId),
          gt(messagesTable.createdAt, p.lastReadAt),
          drizzleSql`${messagesTable.authorId} != ${userId}`,
        ),
        columns: { id: true },
      });
      count = rows.length;
    } else {
      const rows = await db.query.messagesTable.findMany({
        where: and(
          eq(messagesTable.dmThreadId, p.threadId),
          drizzleSql`${messagesTable.authorId} != ${userId}`,
        ),
        columns: { id: true },
      });
      count = rows.length;
    }
    return { threadId: p.threadId, count };
  }));

  res.json(counts);
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

  type FormattedMessage = Awaited<ReturnType<typeof formatMessage>>;
  const grouped: Record<string, { threadId: string; messages: FormattedMessage[] }> = {};
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

// ─── Get single DM thread (with participants) ─────────────────────────────────
router.get("/dms/:threadId", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const participant = await db.query.dmParticipantsTable.findFirst({
    where: and(eq(dmParticipantsTable.threadId, req.params.threadId), eq(dmParticipantsTable.userId, req.user.id)),
  });
  if (!participant) { res.status(404).json({ error: "Thread not found" }); return; }
  const thread = await formatThread(req.params.threadId);
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }
  res.json(thread);
});

// ─── List DM messages ─────────────────────────────────────────────────────────
router.get("/dms/:threadId/messages", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const participant = await db.query.dmParticipantsTable.findFirst({
    where: and(eq(dmParticipantsTable.threadId, req.params.threadId), eq(dmParticipantsTable.userId, req.user.id)),
  });
  if (!participant) { res.status(403).json({ error: "Forbidden" }); return; }

  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const beforeCreatedAt = req.query.beforeCreatedAt as string | undefined;
  const before = req.query.before as string | undefined;

  let resolvedTs: Date | null = null;
  if (beforeCreatedAt) {
    resolvedTs = new Date(beforeCreatedAt);
  } else if (before) {
    const msg = await db.query.messagesTable.findFirst({ where: eq(messagesTable.id, before) });
    resolvedTs = msg?.createdAt ?? null;
  }

  const whereClause = resolvedTs
    ? and(eq(messagesTable.dmThreadId, req.params.threadId), lt(messagesTable.createdAt, resolvedTs))
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
      metadata: parsed.data.metadata ?? null,
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
      const meta = parsed.data.metadata as Record<string, unknown> | null | undefined;
      const isGhost = meta?.ghost === true;
      const body = isGhost ? "👻 Sent a ghost message" : (parsed.data.content ? parsed.data.content.slice(0, 100) : "Sent a message");

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
            await Promise.allSettled([
              sendPushToUser(p.userId, {
                title: `${senderName} (DM)`,
                body,
                icon: senderProfile?.avatarUrl || "/images/icon-192.png",
                url: `/app?${navParams.toString()}`,
                tag: `dm-${req.params.threadId}`,
                nav: { type: "dm", threadId: req.params.threadId },
                otherUserName: senderProfile?.username || "",
                otherDisplayName: senderProfile?.displayName || senderProfile?.username || "",
                otherAvatarUrl: senderProfile?.avatarUrl || "",
                otherStatus: senderProfile?.status || "offline",
              }),
              sendNotification(p.userId, {
                type: 'dm_message',
                title: `${senderName} (DM)`,
                body,
                link: `/app?${navParams.toString()}`,
              }),
            ]);
          })
      );
    } catch (err) {
      console.warn("[dms] Push/notification delivery error:", err);
    }
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
  if ((msg.metadata as Record<string, unknown> | null)?.ghost) {
    res.status(403).json({ error: "Ghost messages cannot be edited." });
    return;
  }

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

  const { threadId, messageId, emojiId } = req.params;
  const decodedEmoji = decodeURIComponent(emojiId);

  // Verify the message belongs to this DM thread
  const targetMsg = await db.query.messagesTable.findFirst({ where: eq(messagesTable.id, messageId) });
  if (!targetMsg || targetMsg.dmThreadId !== threadId) { res.status(404).json({ error: "Message not found" }); return; }

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

  // Re-fetch to get updated reaction counts, then broadcast
  const updatedMsg = await db.query.messagesTable.findFirst({ where: eq(messagesTable.id, messageId) });
  if (!updatedMsg) { res.status(404).json({ error: "Message not found" }); return; }

  const formatted = await formatMessage(updatedMsg, req.user.id);
  broadcast({ type: "MESSAGE_UPDATE", payload: formatted });
  res.json(formatted);
});

// POST /call-signal — store a call signal in the DB and deliver via WS + push.
// This ensures signals reach the callee even when they're offline or WS isn't connected.
// ─── Mark DM thread as read ───────────────────────────────────────────────────
router.post("/dms/:threadId/read", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { threadId } = req.params;
  const participant = await db.query.dmParticipantsTable.findFirst({
    where: and(eq(dmParticipantsTable.threadId, threadId), eq(dmParticipantsTable.userId, req.user.id)),
  });
  if (!participant) { res.status(404).json({ error: "Thread not found" }); return; }

  await db.update(dmParticipantsTable)
    .set({ lastReadAt: new Date() })
    .where(and(eq(dmParticipantsTable.threadId, threadId), eq(dmParticipantsTable.userId, req.user.id)));

  res.json({ ok: true });
});

router.post("/call-signal", async (req, res) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { toUserId, threadId, signalType, payload } = req.body;
  if (!toUserId || !signalType) { res.status(400).json({ error: "Missing toUserId or signalType" }); return; }

  const [row] = await db.insert(dmCallSignalsTable).values({
    fromUserId: req.user.id,
    toUserId,
    threadId: threadId ?? null,
    signalType,
    payload: payload ? JSON.stringify(payload) : null,
  }).returning();

  const wsPayload = {
    ...payload,
    type: signalType,
    targetId: toUserId,
    callerId: req.user.id,
    threadId,
    _signalId: row.id,
  };

  // Try direct WS delivery to the target user
  const delivered = sendToUser(toUserId, { type: "DM_CALL_SIGNAL", payload: wsPayload });
  console.log(`[call-signal] signalType=${signalType} toUserId=${toUserId} wsDelivered=${delivered}`);

  // Broadcast to all connected sockets (covers race conditions with multiple tabs)
  broadcast({ type: "DM_CALL_SIGNAL", payload: wsPayload });

  // If target user has no active WS socket, send a push notification to wake them up.
  // Only push on the FIRST ring from this caller — repeat rings (every 5 s) should not
  // fire a new push because the OS already shows the notification and a second push
  // causes duplicate vibration / re-notification on iOS even with the same tag.
  if (signalType === "call_ring" && !delivered) {
    const priorRings = await db
      .select({ id: dmCallSignalsTable.id })
      .from(dmCallSignalsTable)
      .where(and(
        eq(dmCallSignalsTable.fromUserId, req.user.id),
        eq(dmCallSignalsTable.toUserId, toUserId),
        eq(dmCallSignalsTable.signalType, "call_ring"),
        isNull(dmCallSignalsTable.consumedAt),
      ))
      .limit(2);
    // priorRings includes the row we just inserted; length === 1 means this is the first ring
    if (priorRings.length <= 1) {
      const callerName = payload?.callerName ?? "Someone";
      const callerAvatar = payload?.callerAvatar ?? null;
      const navParams = new URLSearchParams({ navType: "dm", threadId: threadId ?? "" });
      sendPushToUser(toUserId, {
        title: `📞 Incoming call`,
        body: `${callerName} is calling you`,
        icon: callerAvatar || "/images/icon-192.png",
        tag: "incoming-call",
        url: `/app?${navParams.toString()}`,
        nav: threadId ? { type: "dm", threadId } : undefined,
        notifType: "call",
        callerId: req.user.id,
        callerName,
        dmThreadId: threadId,
      }).catch(() => {});
    }
  }

  // When the callee declines (via REST), notify the caller of a missed call.
  // req.user is the callee; toUserId is the original caller.
  if (signalType === "call_decline") {
    (async () => {
      try {
        const [callee] = await db
          .select({ displayName: userProfilesTable.displayName, username: userProfilesTable.username })
          .from(userProfilesTable)
          .where(eq(userProfilesTable.userId, req.user!.id))
          .limit(1);
        const calleeName = callee?.displayName || callee?.username || "Someone";
        const navParams = new URLSearchParams({ navType: "dm", threadId: threadId ?? "" });
        await sendNotification(toUserId, {
          type: "missed_call",
          title: "Missed call",
          body: `${calleeName} declined your call`,
          link: threadId ? `/app?${navParams.toString()}` : undefined,
        });
      } catch { /* non-fatal */ }
    })();
  }

  res.json({ ok: true, id: row.id });
});

// GET /call-signal/pending — return unconsumed signals for the current user, mark consumed.
router.get("/call-signal/pending", async (req, res) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const signals = await db
    .select()
    .from(dmCallSignalsTable)
    .where(and(
      eq(dmCallSignalsTable.toUserId, req.user.id),
      isNull(dmCallSignalsTable.consumedAt),
    ))
    .orderBy(asc(dmCallSignalsTable.createdAt))
    .limit(20);

  if (signals.length > 0) {
    await db
      .update(dmCallSignalsTable)
      .set({ consumedAt: new Date() })
      .where(inArray(dmCallSignalsTable.id, signals.map(s => s.id)));
  }

  // Clean up signals older than 5 minutes to keep the table small
  await db
    .delete(dmCallSignalsTable)
    .where(lt(dmCallSignalsTable.createdAt, new Date(Date.now() - 5 * 60 * 1000)));

  res.json(signals.map(s => ({
    id: s.id,
    fromUserId: s.fromUserId,
    toUserId: s.toUserId,
    threadId: s.threadId,
    signalType: s.signalType,
    payload: s.payload ? JSON.parse(s.payload) : null,
    createdAt: s.createdAt,
  })));
});

export default router;
