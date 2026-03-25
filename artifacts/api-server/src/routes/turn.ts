import { Router, type IRouter } from "express";

const router: IRouter = Router();

interface CachedCredentials {
  iceServers: RTCIceServer[];
  expiresAt: number;
}

interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

let cached: CachedCredentials | null = null;

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

async function fetchCloudflareCredentials(): Promise<RTCIceServer[]> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const secret = process.env.CLOUDFLARE_TURN_KEY_SECRET;

  if (!keyId || !secret) {
    return FALLBACK_ICE_SERVERS;
  }

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ ttl: 86400 }),
      }
    );

    if (!res.ok) {
      console.warn("[TURN] Cloudflare credential fetch failed:", res.status);
      return FALLBACK_ICE_SERVERS;
    }

    const data = await res.json() as { iceServers?: RTCIceServer };
    if (!data.iceServers) {
      return FALLBACK_ICE_SERVERS;
    }

    return [
      { urls: "stun:stun.l.google.com:19302" },
      data.iceServers,
    ];
  } catch (err) {
    console.warn("[TURN] Cloudflare credential fetch error:", err);
    return FALLBACK_ICE_SERVERS;
  }
}

router.get("/turn-credentials", async (_req, res) => {
  try {
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      return res.json({ iceServers: cached.iceServers });
    }

    const iceServers = await fetchCloudflareCredentials();

    cached = {
      iceServers,
      expiresAt: now + 12 * 60 * 60 * 1000,
    };

    res.json({ iceServers });
  } catch (err) {
    console.error("[TURN] Unexpected error:", err);
    res.json({ iceServers: FALLBACK_ICE_SERVERS });
  }
});

export default router;
