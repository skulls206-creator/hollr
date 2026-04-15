import { useEffect, useState, useCallback, useRef } from 'react';

interface OverlayBridge {
  onData: (cb: (data: OverlayData) => void) => void;
  requestData: () => Promise<OverlayData>;
  openApp: () => void;
  setClickThrough: (enabled: boolean) => void;
}

interface VoiceUser {
  userId: string;
  displayName: string;
  username: string;
  muted: boolean;
  speaking: boolean;
  streaming: boolean;
}

interface VoiceRoom {
  channelId: string;
  users: VoiceUser[];
}

interface OverlayData {
  unreadCount: number;
  isLoggedIn: boolean;
  appUrl: string;
  voiceRooms?: VoiceRoom[];
  debugInfo?: string;
}

declare global {
  interface Window {
    overlayBridge?: OverlayBridge;
  }
}

const MOCK_DATA: OverlayData = {
  unreadCount: 3,
  isLoggedIn: true,
  appUrl: 'https://app.hollr.chat',
};

function useBridge() {
  return window.overlayBridge ?? null;
}

export function App() {
  const bridge = useBridge();
  const [data, setData] = useState<OverlayData>(MOCK_DATA);
  const [hovered, setHovered] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!bridge) return;

    bridge.requestData().then(setData).catch(() => {});
    bridge.onData((incoming) => {
      if (incoming && typeof incoming === 'object') {
        setData(incoming as OverlayData);
      }
    });
  }, [bridge]);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHovered(true);
    bridge?.setClickThrough(false);
  }, [bridge]);

  const handleMouseLeave = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      setHovered(false);
      bridge?.setClickThrough(true);
    }, 400);
  }, [bridge]);

  const handleOpenApp = useCallback(() => {
    if (bridge) {
      bridge.openApp();
    } else {
      window.open(data.appUrl, '_blank');
    }
  }, [bridge, data.appUrl]);

  if (collapsed) {
    return (
      <div
        className="pill"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => setCollapsed(false)}
        title="Expand hollr overlay"
      >
        <GemIcon />
        {data.unreadCount > 0 && (
          <span className="badge">{data.unreadCount > 99 ? '99+' : data.unreadCount}</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`overlay-root ${hovered ? 'hovered' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="drag-handle" data-electron-drag>
        <GemIcon />
        <span className="brand">hollr</span>
        <button
          className="icon-btn collapse-btn"
          onClick={() => setCollapsed(true)}
          title="Collapse"
        >
          ›
        </button>
      </div>

      <div className="panel-body">
        {!data.isLoggedIn ? (
          <div className="not-logged-in">
            <p className="hint">Sign in to see your activity</p>
            <button className="open-btn" onClick={handleOpenApp}>
              Open hollr
            </button>
          </div>
        ) : (
          <>
            <NotificationRow count={data.unreadCount} onOpen={handleOpenApp} />
            {data.voiceRooms && data.voiceRooms.length > 0 && (
              <VoiceRoomsSection rooms={data.voiceRooms} />
            )}
            <StatusRow appUrl={data.appUrl} onOpen={handleOpenApp} />
          </>
        )}
      </div>

      <div className="footer">
        <span className="shortcut">Ctrl+Shift+H to toggle</span>
      </div>
      {data.debugInfo && (
        <div style={{ fontSize: '9px', color: '#a0a0b0', padding: '2px 8px 4px', wordBreak: 'break-all', opacity: 0.7 }}>
          {data.debugInfo}
        </div>
      )}
    </div>
  );
}

function VoiceRoomsSection({ rooms }: { rooms: VoiceRoom[] }) {
  const totalUsers = rooms.reduce((sum, r) => sum + r.users.length, 0);
  return (
    <div className="info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px', cursor: 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
        <span className="row-icon">🎙</span>
        <span className="row-label">Voice</span>
        <span className="row-muted" style={{ marginLeft: 'auto' }}>{totalUsers} in voice</span>
      </div>
      {rooms.map(room => (
        <div key={room.channelId} style={{ paddingLeft: '28px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {room.users.map(u => (
            <span
              key={u.userId}
              title={`@${u.username}${u.muted ? ' (muted)' : ''}${u.streaming ? ' (streaming)' : ''}`}
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '9px',
                background: u.speaking ? 'rgba(74,222,128,0.18)' : 'rgba(160,120,255,0.12)',
                color: u.speaking ? '#4ade80' : '#c4b5fd',
                border: `1px solid ${u.speaking ? 'rgba(74,222,128,0.35)' : 'rgba(160,120,255,0.25)'}`,
                display: 'flex', alignItems: 'center', gap: '3px',
              }}
            >
              {u.muted && <span style={{ opacity: 0.7 }}>🔇</span>}
              {u.streaming && <span style={{ opacity: 0.7 }}>📡</span>}
              {u.displayName || u.username}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function NotificationRow({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <div className="info-row" onClick={count > 0 ? onOpen : undefined} style={{ cursor: count > 0 ? 'pointer' : 'default' }}>
      <span className="row-icon">🔔</span>
      <span className="row-label">Notifications</span>
      {count > 0 ? (
        <span className="badge-pill">{count > 99 ? '99+' : count} new</span>
      ) : (
        <span className="row-muted">all clear</span>
      )}
    </div>
  );
}

function StatusRow({ appUrl, onOpen }: { appUrl: string; onOpen: () => void }) {
  return (
    <div className="info-row open-row" onClick={onOpen} style={{ cursor: 'pointer' }}>
      <span className="row-icon">💬</span>
      <span className="row-label">hollr.chat</span>
      <span className="row-url">{appUrl.replace('https://', '')}</span>
    </div>
  );
}

function GemIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polygon
        points="12,2 22,8 22,16 12,22 2,16 2,8"
        fill="url(#gem-grad)"
        stroke="rgba(160,120,255,0.6)"
        strokeWidth="0.8"
      />
      <defs>
        <linearGradient id="gem-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
    </svg>
  );
}
