import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { dmThreadsTable, dmParticipantsTable, messagesTable, attachmentsTable, userProfilesTable } from "@workspace/db/schema";
import { eq, and, lt, inArray } from "drizzle-orm";
import { OpenDmThreadBody, SendMessageBody } from "@workspace/api-zod";
import { broadcast } from "../lib/ws";

const router: IRouter = Router();

async function formatUser(userId: string) {
  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
  });
  return profile ? {
    id: userId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    status: profile.status,
    customStatus: profile.customStatus,
    createdAt: profile.createdAt.toISOString(),
  } : {
    id: userId,
    username: `user_${userId.slice(0, 8)}`,
    displayName: "User",
    avatarUrl: null,
    status: "offline" as const,
    customStatus: null,
    createdAt: new Date().toISOString(),
  };
}

async function formatMessage(msg: typeof messagesTable.$inferSelect) {
  const attachments = await db.query.attachmentsTable.findMany({
    where: eq(attachmentsTable.messageId, msg.id),
  });
  const author = await formatUser(msg.authorId);
  return {
    id: msg.id,
    content: msg.content,
    authorId: msg.authorId,
    channelId: msg.channelId,
    dmThreadId: msg.dmThreadId,
    edited: msg.edited,
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

router.get("/dms", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const participations = await db.query.dmParticipantsTable.findMany({
    where: eq(dmParticipantsTable.userId, req.user.id),
  });

  const threads = await Promise.all(participations.map((p) => formatThread(p.threadId)));
  res.json(threads.filter(Boolean));
});

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

  const formatted = await Promise.all(messages.map(formatMessage));
  res.json(formatted.reverse());
});

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

  const formatted = await formatMessage(msg);
  broadcast({ type: "MESSAGE_CREATE", payload: formatted });
  res.status(201).json(formatted);
});

export default router;
