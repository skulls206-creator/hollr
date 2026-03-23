import { createServer } from "http";
import app from "./app";
import { initWebSocket } from "./lib/ws";
import { db } from "@workspace/db";
import { sessionsTable, usersTable } from "@workspace/db/schema";
import { and, inArray, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";

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
