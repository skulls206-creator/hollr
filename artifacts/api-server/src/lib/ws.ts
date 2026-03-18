import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";

let wss: WebSocketServer | null = null;

// All connected sockets
const clients = new Set<WebSocket>();

// userId → WebSocket (for targeted delivery)
const userSockets = new Map<string, WebSocket>();
// WebSocket → userId (for cleanup)
const socketUsers = new Map<WebSocket, string>();

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    clients.add(ws);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case "IDENTIFY": {
            const userId = msg.payload?.userId;
            if (userId) {
              userSockets.set(userId, ws);
              socketUsers.set(ws, userId);
            }
            break;
          }
          case "VOICE_SIGNAL": {
            const { targetId, ...rest } = msg.payload ?? {};
            if (targetId) {
              sendToUser(targetId, { type: "VOICE_SIGNAL", payload: { ...rest } });
            } else {
              broadcast({ type: "VOICE_SIGNAL", payload: msg.payload });
            }
            break;
          }
          case "PRESENCE_UPDATE": {
            broadcast({ type: "PRESENCE_UPDATE", payload: msg.payload });
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
      }
    };

    ws.on("close", cleanup);
    ws.on("error", cleanup);

    ws.send(JSON.stringify({ type: "CONNECTED" }));
  });
}

export function broadcast(message: object) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export function sendToUser(userId: string, message: object) {
  const ws = userSockets.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}
