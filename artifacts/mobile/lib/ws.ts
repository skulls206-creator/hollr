type Handler = (payload: any) => void;

const listeners = new Map<string, Set<Handler>>();
let ws: WebSocket | null = null;
let _userId: string | null = null;
let _sessionId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 2000;
let isConnecting = false;
let shouldReconnect = true;

const connectedListeners = new Set<(connected: boolean) => void>();

export function onConnectionChange(cb: (connected: boolean) => void) {
  connectedListeners.add(cb);
  return () => connectedListeners.delete(cb);
}

function notifyConnection(connected: boolean) {
  connectedListeners.forEach(cb => cb(connected));
}

function scheduleReconnect() {
  if (!shouldReconnect || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (_userId && _sessionId && shouldReconnect) {
      connectWs(_userId, _sessionId);
    }
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
}

function connectWs(userId: string, sessionId: string) {
  if (isConnecting || ws?.readyState === WebSocket.OPEN) return;
  isConnecting = true;

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const url = `wss://${domain}/api/ws`;

  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      isConnecting = false;
      reconnectDelay = 2000;
      ws!.send(JSON.stringify({ type: 'IDENTIFY', payload: { userId } }));
      notifyConnection(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'PONG') return;
        const handlers = listeners.get(data.type);
        if (handlers) {
          handlers.forEach(h => h(data.payload));
        }
      } catch {}
    };

    ws.onclose = () => {
      isConnecting = false;
      ws = null;
      notifyConnection(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      isConnecting = false;
    };
  } catch {
    isConnecting = false;
    scheduleReconnect();
  }
}

export function connect(userId: string, sessionId: string) {
  _userId = userId;
  _sessionId = sessionId;
  shouldReconnect = true;
  connectWs(userId, sessionId);
}

export function disconnect() {
  shouldReconnect = false;
  _userId = null;
  _sessionId = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  notifyConnection(false);
}

export function subscribe(event: string, handler: Handler): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(handler);
  return () => {
    listeners.get(event)?.delete(handler);
  };
}

export function send(data: object) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function isConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}
