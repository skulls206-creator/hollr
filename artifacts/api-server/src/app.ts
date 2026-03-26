import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "./middlewares/authMiddleware";
import router from "./routes";
import { WebhookHandlers } from "./webhookHandlers";

const app: Express = express();

// ── Stripe webhook MUST be registered before express.json() ─────────────────
// Stripe needs the raw Buffer body to verify the webhook signature.
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('[stripe/webhook] req.body is not a Buffer — express.json() may have run first');
        res.status(500).json({ error: 'Webhook processing error' });
        return;
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: unknown) {
      console.error('[stripe/webhook] error:', err instanceof Error ? err.message : String(err));
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

// Replit runs behind a proxy — trust the first forwarded IP so rate limiting
// keys by the real client IP rather than the proxy's address
app.set('trust proxy', 1);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : null;

app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    // No origin = same-origin or non-browser (curl, mobile, etc.) — allow
    if (!origin) return callback(null, true);
    // In dev with no ALLOWED_ORIGINS set, allow all
    if (!allowedOrigins) return callback(null, true);
    // Strict equality only — no suffix tricks
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
}));

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// --- IP-based limiters run first (before auth, to stop DDoS before hitting DB) ---
// Rate limiting is only enforced in production — dev reloads/tests would exhaust limits instantly.
const isDev = process.env.NODE_ENV !== 'production';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again later." },
  skip: () => isDev,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
  skip: () => isDev,
});

app.use("/api/auth", authLimiter);
app.use("/api", generalLimiter);

// --- Auth middleware must run before any user-ID-keyed limiter ---
app.use(authMiddleware);

// --- Per-user message limiter (keyed by authenticated user ID, applied post-auth) ---
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Slow down — you're sending messages too fast." },
  keyGenerator: (req) => (req as any).user?.id ?? req.ip ?? "anon",
  validate: { keyGeneratorIpFallback: false },
  skip: () => isDev,
});

app.use("/api/channels/:channelId/messages", (req, _res, next) => {
  if (req.method === "POST") { messageLimiter(req, _res, next); return; }
  next();
});
app.use("/api/dms/:threadId/messages", (req, _res, next) => {
  if (req.method === "POST") { messageLimiter(req, _res, next); return; }
  next();
});

app.use("/api", router);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const isCors = err.message?.startsWith("CORS:");
  const status = isCors ? 403 : 500;
  console.error(`[error] ${err.message}`, err.stack);
  res.status(status).json({ error: isCors ? err.message : "Internal server error" });
});

export default app;
