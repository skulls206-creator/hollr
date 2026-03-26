import { createServer } from "http";
import app from "./app";
import { initWebSocket } from "./lib/ws";
import { db } from "@workspace/db";
import { sessionsTable, usersTable } from "@workspace/db/schema";
import { and, inArray, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { runMigrations } from "stripe-replit-sync";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
initWebSocket(server);

// Initialize Stripe via Replit integration (non-fatal if not connected)
if (process.env.REPLIT_CONNECTORS_HOSTNAME) {
  (async () => {
    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) throw new Error('DATABASE_URL is required');

      await runMigrations({ databaseUrl });
      console.log('[stripe] Stripe schema ready');

      const { getStripeSync } = await import('./stripeClient.js');
      const stripeSync = await getStripeSync();

      const webhookBaseUrl = `https://${(process.env.REPLIT_DOMAINS ?? '').split(',')[0]}`;
      if (webhookBaseUrl !== 'https://') {
        try {
          await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
          console.log('[stripe] Managed webhook configured');
        } catch (whErr) {
          console.warn('[stripe] findOrCreateManagedWebhook failed (non-fatal):', whErr);
        }
      }

      stripeSync.syncBackfill()
        .then(() => console.log('[stripe] Backfill complete'))
        .catch((err: unknown) => console.error('[stripe] Backfill error:', err));
    } catch (err) {
      console.error('[stripe] Init failed (non-fatal):', err);
    }
  })();
}

// One-time migration: set password for legacy OIDC accounts that have no password yet
const LEGACY_EMAILS = [
  "skulls206@gmail.com",
  "darrelwoods@gmail.com",
  "khourad@yahoo.com",
];
(async () => {
  try {
    const hash = await bcrypt.hash("PASSwordCHANGE1234", 12);
    const result = await db
      .update(usersTable)
      .set({ passwordHash: hash })
      .where(
        and(
          inArray(usersTable.email, LEGACY_EMAILS),
          isNull(usersTable.passwordHash)
        )
      );
    console.log("[migration] legacy password reset done", result);
  } catch (e) {
    console.warn("[migration] legacy password reset skipped:", e);
  }
})();

// Purge stale OIDC sessions that lack a username field — they crash the Zod
// parse in GET /auth/user and block users from reaching the login page.
(async () => {
  try {
    const { sql: rawSql } = await import("drizzle-orm");
    const result = await db
      .delete(sessionsTable)
      .where(rawSql`(sess->'user'->>'username') IS NULL`);
    console.log("[migration] stale session purge done", result);
  } catch (e) {
    console.warn("[migration] stale session purge skipped:", e);
  }
})();

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
