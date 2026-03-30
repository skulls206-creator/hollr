import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { userProfilesTable, referralsTable, messagesTable } from "@workspace/db/schema";
import { eq, and, count } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient";

const router: IRouter = Router();

const REFERRAL_SUPPORTER_MONTHS = 6;
const REFERRALS_NEEDED = 10;
const SUPPORTER_PRODUCT_NAME = "hollr Supporter";
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

  let code = "";
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

/**
 * Check via Stripe API whether a customer currently has an active/trialing
 * hollr Supporter subscription. Returns false on any error or if no customer.
 */
async function hasActiveStripeSubscription(stripeCustomerId: string | null): Promise<boolean> {
  if (!stripeCustomerId) return false;
  try {
    const stripe = await getUncachableStripeClient();
    const [activeSubs, trialingSubs] = await Promise.all([
      stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "active",
        limit: 20,
        expand: ["data.items.data.price.product"],
      }),
      stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "trialing",
        limit: 20,
        expand: ["data.items.data.price.product"],
      }),
    ]);
    return [...activeSubs.data, ...trialingSubs.data].some(sub =>
      sub.items.data.some(item => {
        const product = item.price?.product as { name?: string; active?: boolean } | null;
        return product?.active && product.name === SUPPORTER_PRODUCT_NAME;
      })
    );
  } catch {
    return false;
  }
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

  const n = Number(validatedCount);

  // Only grant at exact multiples of REFERRALS_NEEDED (10, 20, 30, …)
  // This prevents granting on every call once the threshold is exceeded.
  if (n === 0 || n % REFERRALS_NEEDED !== 0) return;

  // Extend from whichever is later: existing expiry or now.
  // This ensures seamless stacking — if someone re-earns before their current
  // grant expires, the 6 months is added on top rather than resetting to now.
  const referrerProfile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, referrerId),
    columns: { referralSupporterUntil: true },
  });

  const now = new Date();
  const currentUntil = referrerProfile?.referralSupporterUntil;
  const base = currentUntil && currentUntil > now ? currentUntil : now;
  const newUntil = new Date(base);
  newUntil.setMonth(newUntil.getMonth() + REFERRAL_SUPPORTER_MONTHS);

  await db
    .update(userProfilesTable)
    .set({ referralSupporterUntil: newUntil, isSupporter: true, updatedAt: now })
    .where(eq(userProfilesTable.userId, referrerId));
}

/**
 * Called on every /api/supporter/status request.
 *
 * Two roles:
 * 1. Self-heal: if referral grant is still active but isSupporter was clobbered to false
 *    (e.g. by a Stripe webhook that doesn't know about the referral period), restore it.
 * 2. Expiry: if the referral grant has expired, verify via Stripe whether the user
 *    still has an active paid subscription before revoking isSupporter.
 */
export async function expireReferralSupporter(
  userId: string,
  profile: {
    isSupporter: boolean;
    referralSupporterUntil: Date | null;
    stripeCustomerId: string | null;
  }
): Promise<boolean> {
  if (!profile.referralSupporterUntil) return profile.isSupporter;
  const now = new Date();

  // Referral grant is still active — ensure isSupporter reflects it.
  // This self-heals if a Stripe webhook previously clobbered the flag.
  if (profile.referralSupporterUntil > now) {
    if (!profile.isSupporter) {
      await db
        .update(userProfilesTable)
        .set({ isSupporter: true, updatedAt: now })
        .where(eq(userProfilesTable.userId, userId));
    }
    return true;
  }

  // Referral grant has expired — check for an active paid subscription.
  const hasPaidSub = await hasActiveStripeSubscription(profile.stripeCustomerId);

  await db
    .update(userProfilesTable)
    .set({ referralSupporterUntil: null, isSupporter: hasPaidSub, updatedAt: now })
    .where(eq(userProfilesTable.userId, userId));

  return hasPaidSub;
}

/**
 * Public endpoint — no auth required.
 * Returns the referrer's display name for a given referral code, so the
 * signup page can show "You were invited by [Name] to join hollr!".
 */
router.get("/referral/info/:code", async (req: Request, res: Response) => {
  const code = String(req.params["code"] ?? "");
  if (!code || code.length > 16) {
    res.status(400).json({ error: "Invalid code" });
    return;
  }
  try {
    const profile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.referralCode, code.toLowerCase()),
      columns: { displayName: true, username: true },
    });
    if (!profile) {
      res.status(404).json({ error: "Referral code not found" });
      return;
    }
    res.json({ displayName: profile.displayName ?? profile.username });
  } catch (err) {
    console.error("[referral] info error:", err);
    res.status(500).json({ error: "Failed to fetch referral info" });
  }
});

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
    // Run validation for all users referred by the current user who are still pending.
    // This checks whether each referred user has now sent ≥1 message and, if so,
    // marks their referral as validated and grants the referrer's reward.
    const pendingReferrals = await db.query.referralsTable.findMany({
      where: and(
        eq(referralsTable.referrerId, req.user.id),
        eq(referralsTable.validated, false),
      ),
      columns: { referredUserId: true },
    });

    for (const referral of pendingReferrals) {
      await runReferralValidation(referral.referredUserId);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[referral] claim error:", err);
    res.status(500).json({ error: "Failed to run validation" });
  }
});

export default router;
