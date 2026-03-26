import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import { db } from "@workspace/db";
import { userProfilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { sendPushToUser } from "./push";

let wss: WebSocketServer | null = null;

const clients = new Set<WebSocket>();
const userSockets = new Map<string, WebSocket>();
const socketUsers = new Map<WebSocket, string>();

// Track liveness for each socket so we can terminate zombie connections
const socketAlive = new WeakMap<WebSocket, boolean>();

interface VoiceParticipant {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  streaming: boolean;
  hasCamera: boolean;
  isBot?: boolean;
}

// channelId → Map<userId, VoiceParticipant>
const voiceRooms = new Map<string, Map<string, VoiceParticipant>>();
// userId → channelId (for disconnect cleanup)
const userVoiceChannel = new Map<string, string>();

function getRoomUsers(channelId: string): VoiceParticipant[] {
  return Array.from(voiceRooms.get(channelId)?.values() ?? []);
}

function broadcastAll(message: object) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

function leaveVoiceRoom(userId: string) {
  const channelId = userVoiceChannel.get(userId);
  if (!channelId) return;
  voiceRooms.get(channelId)?.delete(userId);
  userVoiceChannel.delete(userId);
  if ((voiceRooms.get(channelId)?.size ?? 0) === 0) voiceRooms.delete(channelId);
  broadcastAll({ type: "VOICE_USER_LEFT", payload: { channelId, userId } });
}

// Invisible users appear as offline to others
function visibleStatus(status: string): string {
  return status === "invisible" ? "offline" : status;
}

export function initWebSocket(server: Server) {
  // Use noServer mode so we can manually intercept the HTTP upgrade event.
  // This lets us accept connections at BOTH /api/ws (dev Vite proxy, which
  // forwards the full path) AND /ws (Replit production proxy, which strips
  // the /api prefix before forwarding to port 8080).
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    const pathname = url.split("?")[0];
    console.log(`[WS] upgrade request pathname=${pathname}`);
    if (pathname === "/api/ws" || pathname === "/ws") {
      wss!.handleUpgrade(req, socket as any, head, (ws) => {
        wss!.emit("connection", ws, req);
      });
    } else {
      console.log(`[WS] rejecting upgrade for unknown path: ${pathname}`);
      socket.destroy();
    }
  });

  // Ping every client every 30 s. Any client that hasn't responded to the
  // previous ping is a zombie — terminate it so cleanup fires and the user
  // is correctly marked offline. This is essential behind proxies (Replit
  // production) that silently drop idle WebSocket connections.
  const pingInterval = setInterval(() => {
    if (!wss) return;
    for (const client of clients) {
      if (socketAlive.get(client) === false) {
        client.terminate();
        continue;
      }
      socketAlive.set(client, false);
      client.ping();
    }
  }, 30_000);

  wss.on("close", () => clearInterval(pingInterval));

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    clients.add(ws);
    socketAlive.set(ws, true);
    ws.on("pong", () => socketAlive.set(ws, true));

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case "PING": {
            socketAlive.set(ws, true);
            ws.send(JSON.stringify({ type: "PONG" }));
            break;
          }

          case "IDENTIFY": {
            const userId = msg.payload?.userId;
            if (userId) {
              userSockets.set(userId, ws);
              socketUsers.set(ws, userId);
              console.log(`[WS] IDENTIFY userId=${userId} totalSockets=${clients.size}`);

              // Read the user's saved status preference from DB and broadcast it.
              // Invisible users appear as offline to everyone else.
              try {
                const profile = await db.query.userProfilesTable.findFirst({
                  where: eq(userProfilesTable.userId, userId),
                  columns: { status: true },
                });
                const savedStatus = profile?.status ?? "online";
                broadcastAll({
                  type: "PRESENCE_UPDATE",
                  payload: { userId, status: visibleStatus(savedStatus) },
                });
              } catch {
                broadcastAll({ type: "PRESENCE_UPDATE", payload: { userId, status: "online" } });
              }

              // Send a full snapshot of all occupied voice rooms so the client
              // can display presence immediately without having joined any channel
              const rooms: { channelId: string; users: VoiceParticipant[] }[] = [];
              for (const [channelId, room] of voiceRooms) {
                if (room.size > 0) {
                  rooms.push({ channelId, users: Array.from(room.values()) });
                }
              }
              ws.send(JSON.stringify({ type: "VOICE_ROOMS_SNAPSHOT", payload: { rooms } }));
            }
            break;
          }

          case "VOICE_SIGNAL": {
            const payload = msg.payload ?? {};
            const { type: vtype, channelId, targetId } = payload;

            if (vtype === "join") {
              const { userId, displayName, username, avatarUrl } = payload;
              if (!channelId || !userId) break;

              // Leave any previous room
              leaveVoiceRoom(userId);

              if (!voiceRooms.has(channelId)) voiceRooms.set(channelId, new Map());
              const room = voiceRooms.get(channelId)!;
              const participant: VoiceParticipant = {
                userId, displayName, username, avatarUrl: avatarUrl ?? null,
                muted: false, deafened: false, speaking: false, streaming: false, hasCamera: false,
              };
              room.set(userId, participant);
              userVoiceChannel.set(userId, channelId);

              // Send current room state to the new joiner
              ws.send(JSON.stringify({
                type: "VOICE_ROOM_STATE",
                payload: { channelId, users: getRoomUsers(channelId) },
              }));

              // Broadcast join to everyone (including joiner, so they see themselves)
              broadcastAll({ type: "VOICE_USER_JOINED", payload: { channelId, user: participant } });
              break;
            }

            if (vtype === "leave") {
              const { userId } = payload;
              if (userId) leaveVoiceRoom(userId);
              break;
            }

            if (vtype === "mute_update") {
              const { userId, muted } = payload;
              if (!channelId || !userId) break;
              const participant = voiceRooms.get(channelId)?.get(userId);
              if (participant) {
                participant.muted = !!muted;
                broadcastAll({ type: "VOICE_USER_UPDATED", payload: { channelId, userId, muted: participant.muted } });
              }
              break;
            }

            if (vtype === "deafen_update") {
              const { userId, deafened } = payload;
              if (!channelId || !userId) break;
              const participant = voiceRooms.get(channelId)?.get(userId);
              if (participant) {
                participant.deafened = !!deafened;
                broadcastAll({ type: "VOICE_USER_UPDATED", payload: { channelId, userId, deafened: participant.deafened } });
              }
              break;
            }

            if (vtype === "speaking_start") {
              const { userId } = payload;
              if (!channelId || !userId) break;
              const participant = voiceRooms.get(channelId)?.get(userId);
              if (participant && !participant.speaking) {
                participant.speaking = true;
                broadcastAll({ type: "VOICE_SPEAKING_START", payload: { channelId, userId } });
              }
              break;
            }

            if (vtype === "speaking_stop") {
              const { userId } = payload;
              if (!channelId || !userId) break;
              const participant = voiceRooms.get(channelId)?.get(userId);
              if (participant && participant.speaking) {
                participant.speaking = false;
                broadcastAll({ type: "VOICE_SPEAKING_STOP", payload: { channelId, userId } });
              }
              break;
            }

            if (vtype === "screen_share_start") {
              const { userId } = payload;
              if (!channelId || !userId) break;
              const participant = voiceRooms.get(channelId)?.get(userId);
              if (participant) {
                participant.streaming = true;
                broadcastAll({ type: "VOICE_USER_UPDATED", payload: { channelId, userId, streaming: true } });
              }
              break;
            }

            if (vtype === "screen_share_stop") {
              const { userId } = payload;
              if (!channelId || !userId) break;
              const participant = voiceRooms.get(channelId)?.get(userId);
              if (participant) {
                participant.streaming = false;
                broadcastAll({ type: "VOICE_USER_UPDATED", payload: { channelId, userId, streaming: false } });
              }
              break;
            }

            if (vtype === "camera_start") {
              const { userId } = payload;
              if (!channelId || !userId) break;
              const participant = voiceRooms.get(channelId)?.get(userId);
              if (participant) {
                participant.hasCamera = true;
                broadcastAll({ type: "VOICE_USER_UPDATED", payload: { channelId, userId, hasCamera: true } });
              }
              break;
            }

            if (vtype === "camera_stop") {
              const { userId } = payload;
              if (!channelId || !userId) break;
              const participant = voiceRooms.get(channelId)?.get(userId);
              if (participant) {
                participant.hasCamera = false;
                broadcastAll({ type: "VOICE_USER_UPDATED", payload: { channelId, userId, hasCamera: false } });
              }
              break;
            }

            if (vtype === "profile_update") {
              const { userId, displayName, avatarUrl } = payload;
              if (!channelId || !userId) break;
              const participant = voiceRooms.get(channelId)?.get(userId);
              if (participant) {
                if (displayName) participant.displayName = displayName;
                if (avatarUrl !== undefined) participant.avatarUrl = avatarUrl ?? null;
                broadcastAll({ type: "VOICE_USER_UPDATED", payload: { channelId, userId, displayName: participant.displayName, avatarUrl: participant.avatarUrl } });
              }
              break;
            }

            // WebRTC signaling (offer/answer/ice) — relay to specific peer or broadcast
            if (targetId) {
              sendToUser(targetId, { type: "VOICE_SIGNAL", payload });
            } else {
              broadcastAll({ type: "VOICE_SIGNAL", payload });
            }
            break;
          }

          case "DM_CALL_SIGNAL": {
            const { targetId, type: signalType, callerName, callerAvatar, dmThreadId, callerId } = msg.payload ?? {};
            console.log(`[WS] DM_CALL_SIGNAL type=${signalType} targetId=${targetId} callerId=${callerId} inMap=${userSockets.has(targetId)} mapSize=${userSockets.size}`);
            if (targetId) {
              const delivered = sendToUser(targetId, { type: "DM_CALL_SIGNAL", payload: msg.payload });
              console.log(`[WS] DM_CALL_SIGNAL delivered=${delivered} targetSocket=${userSockets.get(targetId)?.readyState}`);

              if (signalType === "call_ring" && !delivered) {
                // Target is offline — send push so their device wakes up.
                // Do NOT send call_unavailable back to the caller; let them keep
                // the outgoing-ring UI alive.  The caller re-rings every 5 s and
                // the callee will receive it once they reconnect from the push.
                const navParams = new URLSearchParams({ navType: "dm", threadId: dmThreadId ?? "" });
                sendPushToUser(targetId, {
                  title: `📞 Incoming call`,
                  body: `${callerName ?? "Someone"} is calling you`,
                  icon: callerAvatar || "/images/icon-192.png",
                  tag: "incoming-call",
                  url: `/app?${navParams.toString()}`,
                  nav: dmThreadId ? { type: "dm", threadId: dmThreadId } : undefined,
                  notifType: "call",
                  callerId,
                  callerName,
                  dmThreadId,
                }).catch(() => {});
              }
            }
            break;
          }

          case "VIDEO_CALL_SIGNAL": {
            const { targetId, type: signalType, callerName, callerAvatar, dmThreadId, callerId } = msg.payload ?? {};
            if (targetId) {
              const delivered = sendToUser(targetId, { type: "VIDEO_CALL_SIGNAL", payload: msg.payload });

              if (signalType === "video_ring" && !delivered) {
                // Target is offline — send push, do NOT send video_unavailable.
                const navParams = new URLSearchParams({ navType: "dm", threadId: dmThreadId ?? "" });
                sendPushToUser(targetId, {
                  title: `📹 Incoming video call`,
                  body: `${callerName ?? "Someone"} is video calling you`,
                  icon: callerAvatar || "/images/icon-192.png",
                  tag: "incoming-call",
                  url: `/app?${navParams.toString()}`,
                  nav: dmThreadId ? { type: "dm", threadId: dmThreadId } : undefined,
                  notifType: "video_call",
                  callerId,
                  callerName,
                  dmThreadId,
                }).catch(() => {});
              }
            }
            break;
          }

          case "PRESENCE_UPDATE": {
            const { userId: presenceUserId, status } = msg.payload ?? {};
            const validStatuses = ["online", "idle", "dnd", "invisible"];

            if (presenceUserId && status && validStatuses.includes(status)) {
              // User-chosen status: persist to DB, broadcast the visible version
              try {
                await db
                  .update(userProfilesTable)
                  .set({ status })
                  .where(eq(userProfilesTable.userId, presenceUserId));
              } catch { /* non-fatal */ }
              broadcastAll({
                type: "PRESENCE_UPDATE",
                payload: { userId: presenceUserId, status: visibleStatus(status) },
              });
            } else {
              // Disconnect/offline signal — broadcast as-is, don't overwrite saved preference
              broadcastAll({ type: "PRESENCE_UPDATE", payload: msg.payload });
            }
            break;
          }
        }
      } catch (_) {}
    });

    const cleanup = () => {
      clients.delete(ws);
      const userId = socketUsers.get(ws);
      if (userId) {
        userSockets.delete(userId);
        socketUsers.delete(ws);
        leaveVoiceRoom(userId);
        // Broadcast offline so all clients know this user is gone
        broadcastAll({ type: "PRESENCE_UPDATE", payload: { userId, status: "offline" } });
      }
    };

    ws.on("close", cleanup);
    ws.on("error", cleanup);

    ws.send(JSON.stringify({ type: "CONNECTED" }));
  });
}

export function broadcast(message: object) {
  broadcastAll(message);
}

/** Add a bot participant to voiceRooms so it survives in VOICE_ROOMS_SNAPSHOT on client reconnect. */
export function addBotToVoiceRoom(channelId: string, participant: {
  userId: string; displayName: string; username: string; avatarUrl: string | null; isBot: true;
}) {
  if (!voiceRooms.has(channelId)) voiceRooms.set(channelId, new Map());
  voiceRooms.get(channelId)!.set(participant.userId, {
    ...participant,
    muted: false, deafened: false, speaking: false, streaming: false, hasCamera: false,
  });
}

/** Remove a bot participant from voiceRooms (called when the bot leaves). */
export function removeBotFromVoiceRoom(channelId: string, userId: string) {
  const room = voiceRooms.get(channelId);
  if (!room) return;
  room.delete(userId);
  if (room.size === 0) voiceRooms.delete(channelId);
}

export function sendToUser(userId: string, message: object) {
  const ws = userSockets.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}
