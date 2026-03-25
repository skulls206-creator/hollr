interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const FALLBACK: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

let cached: IceServerConfig[] | null = null;
let cacheExpiresAt = 0;

export async function fetchIceServers(): Promise<IceServerConfig[]> {
  const now = Date.now();
  if (cached && cacheExpiresAt > now) return cached;

  try {
    const res = await fetch('/api/turn-credentials');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { iceServers?: IceServerConfig[] };
    if (!data.iceServers?.length) throw new Error('Empty ICE servers');
    cached = data.iceServers;
    cacheExpiresAt = now + 12 * 60 * 60 * 1000;
    return cached;
  } catch (err) {
    console.warn('[ICE] Failed to fetch TURN credentials, using fallback:', err);
    return FALLBACK;
  }
}
