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

// ── Usage counters ─────────────────────────────────────────────────────────
const stats = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,       // = real Cloudflare API calls
  cloudflareErrors: 0,  // CF API returned non-2xx or threw
  fallbackServed: 0,    // served STUN-only fallback
  startedAt: Date.now(),
};

// Warn if we're calling the Cloudflare API more than N times per hour.
// Each miss = one short-lived credential generated — costs quota & bandwidth.
const MISS_WARN_THRESHOLD_PER_HOUR = 20;
const missTimestamps: number[] = [];

function recordMiss() {
  const now = Date.now();
  missTimestamps.push(now);
  // Slide the window: only keep the last hour
  const cutoff = now - 60 * 60 * 1000;
  while (missTimestamps.length > 0 && missTimestamps[0] < cutoff) {
    missTimestamps.shift();
  }
  if (missTimestamps.length >= MISS_WARN_THRESHOLD_PER_HOUR) {
    console.warn(
      `[TURN] ⚠️  High Cloudflare API usage: ${missTimestamps.length} credential fetches in the last hour.` +
      ` Check https://dash.cloudflare.com/ → Calls for usage details.`
    );
  }
}

async function fetchCloudflareCredentials(): Promise<RTCIceServer[]> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const secret = process.env.CLOUDFLARE_TURN_KEY_SECRET;

  if (!keyId || !secret) {
    console.warn("[TURN] No Cloudflare credentials configured — serving STUN fallback.");
    stats.fallbackServed++;
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
      stats.cloudflareErrors++;
      stats.fallbackServed++;
      return FALLBACK_ICE_SERVERS;
    }

    const data = await res.json() as { iceServers?: RTCIceServer };
    if (!data.iceServers) {
      console.warn("[TURN] Cloudflare response missing iceServers field.");
      stats.cloudflareErrors++;
      stats.fallbackServed++;
      return FALLBACK_ICE_SERVERS;
    }

    console.log("[TURN] Cloudflare credentials fetched (cache miss).");
    return [
      { urls: "stun:stun.l.google.com:19302" },
      data.iceServers,
    ];
  } catch (err) {
    console.warn("[TURN] Cloudflare credential fetch error:", err);
    stats.cloudflareErrors++;
    stats.fallbackServed++;
    return FALLBACK_ICE_SERVERS;
  }
}

// ── GET /turn-credentials ─────────────────────────────────────────────────
router.get("/turn-credentials", async (_req, res) => {
  stats.totalRequests++;
  try {
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      stats.cacheHits++;
      return res.json({ iceServers: cached.iceServers });
    }

    stats.cacheMisses++;
    recordMiss();

    const iceServers = await fetchCloudflareCredentials();

    cached = {
      iceServers,
      expiresAt: now + 12 * 60 * 60 * 1000,
    };

    return res.json({ iceServers });
  } catch (err) {
    console.error("[TURN] Unexpected error:", err);
    return res.json({ iceServers: FALLBACK_ICE_SERVERS });
  }
});

// ── GET /turn-stats ───────────────────────────────────────────────────────
// Internal monitoring — shows usage counters and cache state.
// Only accessible in development or with a correct header in production.
router.get("/turn-stats", (req, res) => {
  const isDev = process.env.NODE_ENV !== "production";
  const hasAdminHeader = req.headers["x-admin-key"] === process.env.ADMIN_KEY;
  if (!isDev && !hasAdminHeader) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const uptimeSeconds = Math.round((Date.now() - stats.startedAt) / 1000);
  const cacheExpiresIn = cached
    ? Math.max(0, Math.round((cached.expiresAt - Date.now()) / 1000))
    : null;
  const missesLastHour = missTimestamps.filter(
    (t) => t > Date.now() - 60 * 60 * 1000
  ).length;

  return res.json({
    uptimeSeconds,
    cache: {
      active: cached !== null,
      expiresInSeconds: cacheExpiresIn,
    },
    requests: {
      total: stats.totalRequests,
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses,
      cloudflareApiCalls: stats.cacheMisses,
      cloudflareErrors: stats.cloudflareErrors,
      fallbackServed: stats.fallbackServed,
    },
    rateWarning: {
      missesLastHour,
      warnThresholdPerHour: MISS_WARN_THRESHOLD_PER_HOUR,
      isElevated: missesLastHour >= MISS_WARN_THRESHOLD_PER_HOUR,
    },
  });
});

export default router;
