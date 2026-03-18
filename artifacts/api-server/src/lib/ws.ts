import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { Server } from "http";

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    clients.add(ws);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "VOICE_SIGNAL") {
          // Forward WebRTC signaling to target peer
          const target = msg.payload?.targetId;
          if (target) {
            broadcastToTarget(msg, target);
          }
        }
        if (msg.type === "PRESENCE_UPDATE") {
          broadcast({ type: "PRESENCE_UPDATE", payload: msg.payload });
        }
      } catch (_) {}
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", () => {
      clients.delete(ws);
    });

    // Acknowledge connection
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

function broadcastToTarget(message: object, targetUserId: string) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      // In a real app we'd map userId -> WebSocket; for now broadcast to all
      client.send(data);
    }
  }
}
