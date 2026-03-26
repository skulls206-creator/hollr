import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  messagesTable,
  userProfilesTable,
  channelsTable,
  serversTable,
  serverMembersTable,
  dmThreadsTable,
  dmParticipantsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, desc, sql, gte } from "drizzle-orm";

const router: IRouter = Router();

// GET /api/activity — last 30 events across the user's joined servers + DMs
router.get("/activity", async (req, res) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  try {
    // 1. Get server IDs the user is a member of
    const memberships = await db
      .select({ serverId: serverMembersTable.serverId })
      .from(serverMembersTable)
      .where(eq(serverMembersTable.userId, userId));
    const serverIds = memberships.map(m => m.serverId);

    // 2. Get channel IDs in those servers
    let channelIds: string[] = [];
    if (serverIds.length > 0) {
      const chans = await db
        .select({ id: channelsTable.id, serverId: channelsTable.serverId, name: channelsTable.name })
        .from(channelsTable)
        .where(inArray(channelsTable.serverId, serverIds));
      channelIds = chans.map(c => c.id);
    }

    // 3. Get server info map
    const serverMap: Record<string, { name: string; iconUrl: string | null }> = {};
    if (serverIds.length > 0) {
      const serverRows = await db
        .select({ id: serversTable.id, name: serversTable.name, iconUrl: serversTable.iconUrl })
        .from(serversTable)
        .where(inArray(serversTable.id, serverIds));
      for (const s of serverRows) serverMap[s.id] = { name: s.name, iconUrl: s.iconUrl };
    }

    // 4. Channel map for server messages
    const channelMap: Record<string, { name: string; serverId: string }> = {};
    if (channelIds.length > 0) {
      const chanRows = await db
        .select({ id: channelsTable.id, name: channelsTable.name, serverId: channelsTable.serverId })
        .from(channelsTable)
        .where(inArray(channelsTable.id, channelIds));
      for (const c of chanRows) channelMap[c.id] = { name: c.name, serverId: c.serverId };
    }

    // 5. Recent server channel messages (not deleted, not by the current user)
    type ActivityEvent = {
      type: string;
      title: string;
      subtitle: string;
      avatarUrl: string | null;
      timestamp: string;
      link: string | null;
      serverId: string | null;
      channelId: string | null;
      threadId: string | null;
    };
    const events: ActivityEvent[] = [];

    if (channelIds.length > 0) {
      const serverMsgs = await db
        .select({
          id: messagesTable.id,
          content: messagesTable.content,
          authorId: messagesTable.authorId,
          channelId: messagesTable.channelId,
          createdAt: messagesTable.createdAt,
          displayName: userProfilesTable.displayName,
          username: userProfilesTable.username,
          avatarUrl: userProfilesTable.avatarUrl,
        })
        .from(messagesTable)
        .innerJoin(userProfilesTable, eq(messagesTable.authorId, userProfilesTable.userId))
        .where(and(
          inArray(messagesTable.channelId, channelIds),
          eq(messagesTable.deleted, false),
        ))
        .orderBy(desc(messagesTable.createdAt))
        .limit(20);

      for (const m of serverMsgs) {
        const chan = m.channelId ? channelMap[m.channelId] : null;
        const serverName = chan ? (serverMap[chan.serverId]?.name ?? 'Server') : 'Server';
        const channelName = chan?.name ?? 'channel';
        events.push({
          type: 'message',
          title: `${m.displayName || m.username} in #${channelName}`,
          subtitle: m.content.length > 80 ? m.content.slice(0, 80) + '…' : m.content,
          avatarUrl: m.avatarUrl,
          timestamp: m.createdAt.toISOString(),
          link: null,
          serverId: chan?.serverId ?? null,
          channelId: m.channelId,
          threadId: null,
        });
      }
    }

    // 6. Recent DM activity — show threads the user participates in
    const userDmThreads = await db
      .select({ threadId: dmParticipantsTable.threadId })
      .from(dmParticipantsTable)
      .where(eq(dmParticipantsTable.userId, userId));
    const dmThreadIds = userDmThreads.map(t => t.threadId);

    if (dmThreadIds.length > 0) {
      const dmMsgs = await db
        .select({
          id: messagesTable.id,
          content: messagesTable.content,
          authorId: messagesTable.authorId,
          dmThreadId: messagesTable.dmThreadId,
          createdAt: messagesTable.createdAt,
          displayName: userProfilesTable.displayName,
          username: userProfilesTable.username,
          avatarUrl: userProfilesTable.avatarUrl,
        })
        .from(messagesTable)
        .innerJoin(userProfilesTable, eq(messagesTable.authorId, userProfilesTable.userId))
        .where(and(
          inArray(messagesTable.dmThreadId, dmThreadIds),
          eq(messagesTable.deleted, false),
        ))
        .orderBy(desc(messagesTable.createdAt))
        .limit(15);

      for (const m of dmMsgs) {
        if (m.authorId === userId) continue; // skip own DMs
        events.push({
          type: 'dm',
          title: `${m.displayName || m.username}`,
          subtitle: 'Sent you a message', // mask DM content for privacy
          avatarUrl: m.avatarUrl,
          timestamp: m.createdAt.toISOString(),
          link: null,
          serverId: null,
          channelId: null,
          threadId: m.dmThreadId,
        });
      }
    }

    // 7. Recent server member joins (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (serverIds.length > 0) {
      const joins = await db
        .select({
          userId: serverMembersTable.userId,
          serverId: serverMembersTable.serverId,
          joinedAt: serverMembersTable.joinedAt,
          displayName: userProfilesTable.displayName,
          username: userProfilesTable.username,
          avatarUrl: userProfilesTable.avatarUrl,
        })
        .from(serverMembersTable)
        .innerJoin(userProfilesTable, eq(serverMembersTable.userId, userProfilesTable.userId))
        .where(and(
          inArray(serverMembersTable.serverId, serverIds),
          gte(serverMembersTable.joinedAt, oneDayAgo),
        ))
        .orderBy(desc(serverMembersTable.joinedAt))
        .limit(10);

      for (const j of joins) {
        if (j.userId === userId) continue; // skip own joins
        const serverName = serverMap[j.serverId]?.name ?? 'a server';
        events.push({
          type: 'join',
          title: `${j.displayName || j.username} joined ${serverName}`,
          subtitle: 'New member',
          avatarUrl: j.avatarUrl,
          timestamp: j.joinedAt.toISOString(),
          link: null,
          serverId: j.serverId,
          channelId: null,
          threadId: null,
        });
      }
    }

    // 8. Sort all events by timestamp desc, limit 30
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(events.slice(0, 30));
  } catch (err: any) {
    console.error('[activity] error:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// GET /api/presence/summary?serverIds=a,b,c
// Returns { [serverId]: count } — count of online users in each server.
// Only servers the requester is actually a member of are counted (no IDOR).
router.get("/presence/summary", async (req, res) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = req.user.id;

  const raw = req.query.serverIds as string | undefined;
  if (!raw) { res.json({}); return; }
  const requestedIds = raw.split(',').filter(Boolean).slice(0, 50); // max 50
  if (requestedIds.length === 0) { res.json({}); return; }

  try {
    // Verify requester membership — only allow servers they belong to
    const memberships = await db
      .select({ serverId: serverMembersTable.serverId })
      .from(serverMembersTable)
      .where(and(
        eq(serverMembersTable.userId, userId),
        inArray(serverMembersTable.serverId, requestedIds),
      ));
    const allowedIds = memberships.map(m => m.serverId);
    if (allowedIds.length === 0) { res.json({}); return; }

    const { getOnlineUserIds } = await import('../lib/ws.js');
    const onlineIds = getOnlineUserIds();

    // Single bulk query: all members across all allowed servers
    const allMembers = await db
      .select({ serverId: serverMembersTable.serverId, userId: serverMembersTable.userId })
      .from(serverMembersTable)
      .where(inArray(serverMembersTable.serverId, allowedIds));

    // Group and count online members per server
    const result: Record<string, number> = Object.fromEntries(allowedIds.map(id => [id, 0]));
    for (const m of allMembers) {
      if (onlineIds.has(m.userId)) result[m.serverId] = (result[m.serverId] ?? 0) + 1;
    }
    res.json(result);
  } catch (err: any) {
    console.error('[presence/summary] error:', err);
    res.status(500).json({ error: 'Failed to fetch presence' });
  }
});

export default router;
