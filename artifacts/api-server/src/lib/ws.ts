import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";
import { db } from "@workspace/db";
import { userProfilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

let wss: WebSocketServer | null = null;

const clients = new Set<WebSocket>();
const userSockets = new Map<string, WebSocket>();
const socketUsers = new Map<WebSocket, string>();

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
  wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    clients.add(ws);

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case "IDENTIFY": {
            const userId = msg.payload?.userId;
            if (userId) {
              userSockets.set(userId, ws);
              socketUsers.set(ws, userId);

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

export function sendToUser(userId: string, message: object) {
  const ws = userSockets.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}
