import bcrypt from "bcryptjs";
import { Router, type IRouter, type Request, type Response } from "express";
import { GetCurrentAuthUserResponse } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { userProfilesTable, referralsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
} from "../lib/auth";
import { runReferralValidation } from "./referral";

const router: IRouter = Router();

function setSessionCookie(res: Response, sid: string) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    // In production the static frontend and API are on different origins via
    // Replit's proxy, so we need SameSite=None. In dev both are same-origin.
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
const BCRYPT_ROUNDS = 12;

// ── GET /auth/user ────────────────────────────────────────────────────────────
router.get("/auth/user", (req: Request, res: Response) => {
  try {
    res.json(
      GetCurrentAuthUserResponse.parse({
        user: req.isAuthenticated() ? req.user : null,
      }),
    );
  } catch {
    // Session exists but has a stale/invalid shape (e.g. old OIDC sessions).
    // Treat as unauthenticated so the client lands on the login page.
    res.json(GetCurrentAuthUserResponse.parse({ user: null }));
  }
});

function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress ?? req.ip ?? null;
}

// ── POST /auth/signup ─────────────────────────────────────────────────────────
router.post("/auth/signup", async (req: Request, res: Response) => {
  const { username, password, ref } = req.body ?? {};

  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    res.status(400).json({ error: "Username must be 3–32 characters (letters, numbers, underscores only)" });
    return;
  }
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  // Check username taken (case-insensitive)
  const existingProfile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.username, username.toLowerCase()),
  });
  if (existingProfile) {
    res.status(409).json({ error: "Username is already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const [newUser] = await db
    .insert(usersTable)
    .values({ passwordHash })
    .returning();

  const normalizedUsername = username.toLowerCase();
  const signupIp = getClientIp(req);

  let referredByUserId: string | undefined;
  if (typeof ref === "string" && ref.length > 0) {
    const referrerProfile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.referralCode, ref.toLowerCase().trim()),
      columns: { userId: true, signupIp: true },
    });
    if (referrerProfile && referrerProfile.userId !== newUser.id) {
      const referrerIp = referrerProfile.signupIp;
      const isSameIp = signupIp && referrerIp && signupIp === referrerIp;
      if (!isSameIp) {
        referredByUserId = referrerProfile.userId;
      }
    }
  }

  await db.insert(userProfilesTable).values({
    userId: newUser.id,
    username: normalizedUsername,
    displayName: username,
    status: "online",
    signupIp: signupIp ?? undefined,
    referredByUserId: referredByUserId,
  });

  if (referredByUserId) {
    try {
      await db.insert(referralsTable).values({
        referrerId: referredByUserId,
        referredUserId: newUser.id,
        signupIp: signupIp ?? undefined,
      }).onConflictDoNothing();
    } catch {
      // non-fatal — referral already exists
    }
  }

  const sid = await createSession({
    user: { id: newUser.id, username: normalizedUsername, email: null },
  });
  setSessionCookie(res, sid);

  res.status(201).json({ id: newUser.id, username: normalizedUsername, email: null });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
// `identifier` can be a username or an email address
router.post("/auth/login", async (req: Request, res: Response) => {
  const { identifier, password } = req.body ?? {};

  if (typeof identifier !== "string" || !identifier.trim()) {
    res.status(400).json({ error: "Username or email is required" });
    return;
  }
  if (typeof password !== "string" || !password) {
    res.status(400).json({ error: "Password is required" });
    return;
  }

  const isEmail = identifier.includes("@");

  let userId: string | undefined;
  let storedHash: string | null | undefined;
  let userEmail: string | null = null;
  let username: string | undefined;

  if (isEmail) {
    // Look up by email in usersTable
    const userRow = await db.query.usersTable.findFirst({
      where: eq(usersTable.email, identifier.toLowerCase().trim()),
    });
    if (!userRow) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    userId = userRow.id;
    storedHash = userRow.passwordHash;
    userEmail = userRow.email ?? null;

    const profile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.userId, userId),
    });
    username = profile?.username;
  } else {
    // Look up by username in userProfilesTable
    const profile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.username, identifier.toLowerCase().trim()),
    });
    if (!profile) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    userId = profile.userId;
    username = profile.username;

    const userRow = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });
    storedHash = userRow?.passwordHash;
    userEmail = userRow?.email ?? null;
  }

  if (!storedHash || !username) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, storedHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Update profile status to online
  await db
    .update(userProfilesTable)
    .set({ status: "online", updatedAt: new Date() })
    .where(eq(userProfilesTable.userId, userId));

  const sid = await createSession({
    user: { id: userId, username, email: userEmail },
  });
  setSessionCookie(res, sid);

  res.json({ id: userId, username, email: userEmail });

  // Fire-and-forget: validate any pending referrals for this user
  runReferralValidation(userId).catch(() => {});
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
router.post("/auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ success: true });
});

// ── PATCH /auth/email ─────────────────────────────────────────────────────────
// Authenticated users can add/update their email address
router.patch("/auth/email", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { email } = req.body ?? {};

  if (typeof email !== "string" || !email.includes("@") || email.length > 255) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check email not already in use
  const existing = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, normalizedEmail),
  });
  if (existing && existing.id !== req.user.id) {
    res.status(409).json({ error: "Email is already associated with another account" });
    return;
  }

  await db
    .update(usersTable)
    .set({ email: normalizedEmail, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user.id));

  // Update session with new email
  const sid = getSessionId(req);
  if (sid) {
    const { updateSession } = await import("../lib/auth");
    await updateSession(sid, {
      user: { ...req.user, email: normalizedEmail },
    });
  }

  res.json({ email: normalizedEmail });
});

// Authenticated users can change their password
router.patch("/auth/password", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { currentPassword, newPassword } = req.body ?? {};

  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, req.user.id),
  });

  if (!user?.passwordHash) {
    res.status(400).json({ error: "Account has no password set" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await db
    .update(usersTable)
    .set({ passwordHash: hash, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user.id));

  res.json({ success: true });
});

// ── POST /mobile-auth/logout (kept for mobile compat) ────────────────────────
router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json({ success: true });
});

export default router;
