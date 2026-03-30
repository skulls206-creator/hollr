import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { userProfilesTable, referralsTable, messagesTable } from "@workspace/db/schema";
import { eq, and, count } from "drizzle-orm";

const router: IRouter = Router();

const REFERRAL_SUPPORTER_MONTHS = 6;
const REFERRALS_NEEDED = 10;
const CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const CODE_LENGTH = 8;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function getAppBaseUrl(): string {
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
  if (domain) return `https://${domain}`;
  return "http://localhost:3000";
}

async function ensureReferralCode(userId: string): Promise<string> {
  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, userId),
    columns: { referralCode: true },
  });

  if (profile?.referralCode) return profile.referralCode;

  let code: string;
  let attempts = 0;
  while (true) {
    code = generateCode();
    const existing = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.referralCode, code),
      columns: { userId: true },
    });
    if (!existing) break;
    if (++attempts > 10) throw new Error("Could not generate unique referral code");
  }

  await db
    .update(userProfilesTable)
    .set({ referralCode: code })
    .where(eq(userProfilesTable.userId, userId));

  return code;
}

export async function runReferralValidation(userId: string): Promise<void> {
  const pendingReferrals = await db.query.referralsTable.findMany({
    where: and(
      eq(referralsTable.referredUserId, userId),
      eq(referralsTable.validated, false),
    ),
  });

  if (pendingReferrals.length === 0) return;

  const [{ count: msgCount }] = await db
    .select({ count: count() })
    .from(messagesTable)
    .where(and(eq(messagesTable.authorId, userId), eq(messagesTable.deleted, false)));

  if (Number(msgCount) < 1) return;

  const now = new Date();
  for (const referral of pendingReferrals) {
    await db
      .update(referralsTable)
      .set({ validated: true, validatedAt: now })
      .where(eq(referralsTable.id, referral.id));

    await checkAndGrantReferralSupporter(referral.referrerId);
  }
}

async function checkAndGrantReferralSupporter(referrerId: string): Promise<void> {
  const [{ count: validatedCount }] = await db
    .select({ count: count() })
    .from(referralsTable)
    .where(and(eq(referralsTable.referrerId, referrerId), eq(referralsTable.validated, true)));

  if (Number(validatedCount) < REFERRALS_NEEDED) return;

  const referrerProfile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, referrerId),
    columns: { referralSupporterUntil: true, isSupporter: true },
  });

  const now = new Date();
  const currentUntil = referrerProfile?.referralSupporterUntil;
  const base = currentUntil && currentUntil > now ? currentUntil : now;
  const newUntil = new Date(base);
  newUntil.setMonth(newUntil.getMonth() + REFERRAL_SUPPORTER_MONTHS);

  await db
    .update(userProfilesTable)
    .set({ referralSupporterUntil: newUntil, isSupporter: true, updatedAt: new Date() })
    .where(eq(userProfilesTable.userId, referrerId));
}

export async function expireReferralSupporter(userId: string, profile: { isSupporter: boolean; referralSupporterUntil: Date | null; stripeCustomerId: string | null }): Promise<boolean> {
  if (!profile.referralSupporterUntil) return profile.isSupporter;
  const now = new Date();
  if (profile.referralSupporterUntil > now) return profile.isSupporter;

  const hasStripe = !!profile.stripeCustomerId;
  if (!hasStripe) {
    await db
      .update(userProfilesTable)
      .set({ isSupporter: false, referralSupporterUntil: null, updatedAt: new Date() })
      .where(eq(userProfilesTable.userId, userId));
    return false;
  }

  await db
    .update(userProfilesTable)
    .set({ referralSupporterUntil: null, updatedAt: new Date() })
    .where(eq(userProfilesTable.userId, userId));

  return profile.isSupporter;
}

router.get("/referral/status", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const code = await ensureReferralCode(req.user.id);
    const baseUrl = getAppBaseUrl();
    const referralLink = `${baseUrl}/?ref=${code}`;

    const referrals = await db.query.referralsTable.findMany({
      where: eq(referralsTable.referrerId, req.user.id),
      columns: { validated: true, validatedAt: true, createdAt: true },
    });

    const profile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.userId, req.user.id),
      columns: { referralSupporterUntil: true },
    });

    res.json({
      referralCode: code,
      referralLink,
      totalSignups: referrals.length,
      validatedCount: referrals.filter(r => r.validated).length,
      referralSupporterUntil: profile?.referralSupporterUntil ?? null,
    });
  } catch (err) {
    console.error("[referral] status error:", err);
    res.status(500).json({ error: "Failed to fetch referral status" });
  }
});

router.post("/referral/claim", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    await runReferralValidation(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error("[referral] claim error:", err);
    res.status(500).json({ error: "Failed to run validation" });
  }
});

export default router;
