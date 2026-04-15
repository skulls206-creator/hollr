import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { userProfilesTable } from "@workspace/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient";
import { expireReferralSupporter } from "./referral";

const router: IRouter = Router();

const PRODUCT_NAME = 'hollr Supporter';

function getAppBaseUrl(): string {
  const domain = (process.env.REPLIT_DOMAINS ?? '').split(',')[0].trim();
  if (domain) return `https://${domain}`;
  return 'http://localhost:3000';
}

/**
 * Ensures the hollr Supporter product and its three prices exist in Stripe.
 * Safe to call on every boot — skips creation if already present.
 */
export async function bootstrapSupporterProduct() {
  try {
    const stripe = await getUncachableStripeClient();

    // Find or create product
    const existing = await stripe.products.search({
      query: `name:'${PRODUCT_NAME}' AND active:'true'`,
      limit: 1,
    });

    let productId: string;
    if (existing.data[0]) {
      productId = existing.data[0].id;
      console.log(`[supporter] product exists id=${productId}`);
    } else {
      const created = await stripe.products.create({
        name: PRODUCT_NAME,
        description: 'Access to KHURK diamond badge and supporter perks.',
      });
      productId = created.id;
      console.log(`[supporter] product created id=${productId}`);
    }

    // Desired prices: monthly $1, 6-month $5, yearly $9
    const desired = [
      { unit_amount: 100,  interval: 'month' as const, interval_count: 1 },
      { unit_amount: 500,  interval: 'month' as const, interval_count: 6 },
      { unit_amount: 900,  interval: 'year'  as const, interval_count: 1 },
    ];

    const existingPrices = await stripe.prices.list({ product: productId, active: true, limit: 20 });

    for (const d of desired) {
      const match = existingPrices.data.find(
        p => p.unit_amount === d.unit_amount &&
             p.recurring?.interval === d.interval &&
             p.recurring?.interval_count === d.interval_count
      );
      if (!match) {
        const p = await stripe.prices.create({
          product: productId,
          unit_amount: d.unit_amount,
          currency: 'usd',
          recurring: { interval: d.interval, interval_count: d.interval_count },
        });
        console.log(`[supporter] price created ${d.unit_amount}¢ every ${d.interval_count} ${d.interval} id=${p.id}`);
      }
    }

    console.log('[supporter] bootstrap complete');
  } catch (err) {
    console.error('[supporter] bootstrap error:', err);
  }
}

/**
 * On startup, re-sync every user who has a Stripe customer ID.
 * Catches any missed webhooks (e.g. the expansion-depth bug) and keeps
 * isSupporter accurate without requiring manual intervention.
 */
export async function syncAllSupporterStatuses() {
  try {
    const stripe = await getUncachableStripeClient();

    // Get the hollr Supporter product ID once
    const productSearch = await stripe.products.search({
      query: `name:'${PRODUCT_NAME}' AND active:'true'`,
      limit: 1,
    });
    const supporterProductId = productSearch.data[0]?.id ?? null;
    if (!supporterProductId) {
      console.warn('[supporter] sync-all: product not found, skipping');
      return;
    }

    // All users with a Stripe customer ID
    const users = await db.query.userProfilesTable.findMany({
      where: isNotNull(userProfilesTable.stripeCustomerId),
      columns: { userId: true, stripeCustomerId: true, referralSupporterUntil: true },
    });

    console.log(`[supporter] sync-all: checking ${users.length} Stripe customer(s)`);
    let updated = 0;

    for (const user of users) {
      if (!user.stripeCustomerId) continue;
      try {
        const [active, trialing] = await Promise.all([
          stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'active',   limit: 10, expand: ['data.items.data.price'] }),
          stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'trialing', limit: 10, expand: ['data.items.data.price'] }),
        ]);
        const allSubs = [...active.data, ...trialing.data];
        const hasPaidSub = allSubs.some(sub =>
          sub.items.data.some(item => {
            const pid = typeof item.price?.product === 'string'
              ? item.price.product
              : (item.price?.product as { id?: string } | null)?.id ?? null;
            return pid === supporterProductId;
          })
        );
        const now = new Date();
        const hasActiveReferral = user.referralSupporterUntil != null && user.referralSupporterUntil > now;
        const isSupporter = hasPaidSub || hasActiveReferral;
        await db.update(userProfilesTable).set({ isSupporter }).where(eq(userProfilesTable.userId, user.userId));
        if (hasPaidSub || hasActiveReferral) {
          console.log(`[supporter] sync-all: ${user.userId} isSupporter=${isSupporter} (paid=${hasPaidSub} referral=${hasActiveReferral})`);
          updated++;
        }
      } catch (innerErr) {
        console.warn(`[supporter] sync-all: error for ${user.stripeCustomerId}:`, innerErr);
      }
    }

    console.log(`[supporter] sync-all complete — ${updated} supporter(s) confirmed`);
  } catch (err) {
    console.error('[supporter] sync-all error:', err);
  }
}

/** Fetch active prices for the hollr Supporter product straight from the Stripe API. */
async function fetchSupporterPricesFromStripe() {
  const stripe = await getUncachableStripeClient();

  // Find the active product by name
  const products = await stripe.products.search({
    query: `name:'${PRODUCT_NAME}' AND active:'true'`,
    limit: 1,
  });

  const product = products.data[0];
  if (!product) {
    console.warn('[supporter] product not found in Stripe — run bootstrapSupporterProduct');
    return [];
  }

  // List all active prices for that product
  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 10,
  });

  // Shape to match what the frontend expects
  return prices.data
    .map(p => ({
      price_id: p.id,
      unit_amount: p.unit_amount ?? 0,
      currency: p.currency,
      recurring: p.recurring
        ? {
            interval: p.recurring.interval,
            interval_count: p.recurring.interval_count,
            usage_type: p.recurring.usage_type,
            meter: null,
            trial_period_days: p.recurring.trial_period_days ?? null,
          }
        : null,
    }))
    .sort((a, b) => a.unit_amount - b.unit_amount);
}

/** Validate that a given priceId belongs to the hollr Supporter product via Stripe API. */
async function isSupporterPriceId(priceId: string): Promise<boolean> {
  try {
    const stripe = await getUncachableStripeClient();
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    if (!price.active) return false;
    const prod = price.product as { name?: string; active?: boolean } | null;
    return !!(prod && prod.active && prod.name === PRODUCT_NAME);
  } catch {
    return false;
  }
}

// GET /api/supporter/status — returns supporter status for the current user
router.get('/supporter/status', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const profile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.userId, req.user.id),
    });

    const isSupporter = await expireReferralSupporter(req.user.id, {
      isSupporter: profile?.isSupporter ?? false,
      referralSupporterUntil: profile?.referralSupporterUntil ?? null,
      stripeCustomerId: profile?.stripeCustomerId ?? null,
    });

    res.json({
      isSupporter,
      hasCustomerId: !!(profile?.stripeCustomerId),
    });
  } catch (err) {
    console.error('[supporter] status error:', err);
    res.status(500).json({ error: 'Failed to fetch supporter status' });
  }
});

// GET /api/supporter/prices — return active prices from Stripe API directly
router.get('/supporter/prices', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const prices = await fetchSupporterPricesFromStripe();
    res.json({ prices });
  } catch (err) {
    console.error('[supporter] prices error:', err);
    res.json({ prices: [] });
  }
});

// POST /api/supporter/checkout — create a Stripe Checkout Session
router.post('/supporter/checkout', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { priceId } = req.body as { priceId?: string };
  if (!priceId || typeof priceId !== 'string') {
    res.status(400).json({ error: 'priceId is required' });
    return;
  }

  // Server-side validate: priceId must belong to the hollr Supporter product
  const valid = await isSupporterPriceId(priceId);
  if (!valid) {
    res.status(400).json({ error: 'Invalid priceId — not a supporter price' });
    return;
  }

  try {
    const profile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.userId, req.user.id),
    });

    if (!profile) {
      res.status(400).json({ error: 'User profile not found — please contact support' });
      return;
    }

    const stripe = await getUncachableStripeClient();

    let customerId = profile.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId: req.user.id },
      });
      customerId = customer.id;
      await db
        .update(userProfilesTable)
        .set({ stripeCustomerId: customerId })
        .where(eq(userProfilesTable.userId, req.user.id));
    }

    const appUrl = getAppBaseUrl();
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${appUrl}/?supporter=success`,
      cancel_url: `${appUrl}/?supporter=cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[supporter] checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /api/supporter/portal — create a Stripe billing portal session
router.post('/supporter/portal', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const profile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.userId, req.user.id),
    });

    if (!profile?.stripeCustomerId) {
      res.status(400).json({ error: 'No billing account found' });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const appUrl = getAppBaseUrl();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripeCustomerId,
      return_url: `${appUrl}/`,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    console.error('[supporter] portal error:', err);
    res.status(500).json({ error: 'Failed to open billing portal' });
  }
});

// ── Admin helpers ─────────────────────────────────────────────────────────────

function isAdminUser(userId: string): boolean {
  const raw = process.env.ADMIN_USER_IDS ?? '';
  return raw.split(',').map(s => s.trim()).filter(Boolean).includes(userId);
}

// GET /api/admin/check — returns whether the current user is an admin
router.get('/admin/check', (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  res.json({ isAdmin: isAdminUser(req.user.id) });
});

// POST /api/admin/grant-supporter
// Body: { username: string, months: number, revoke?: boolean }
router.post('/admin/grant-supporter', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!isAdminUser(req.user.id)) { res.status(403).json({ error: 'Forbidden' }); return; }

  const { username, months, revoke } = req.body as {
    username?: string;
    months?: number;
    revoke?: boolean;
  };

  if (!username || typeof username !== 'string') {
    res.status(400).json({ error: 'username is required' });
    return;
  }

  try {
    const profile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.username, username.trim()),
    });

    if (!profile) {
      res.status(404).json({ error: `No user found with username "${username}"` });
      return;
    }

    if (revoke) {
      await db
        .update(userProfilesTable)
        .set({ isSupporter: false, referralSupporterUntil: null })
        .where(eq(userProfilesTable.userId, profile.userId));

      console.log(`[admin] revoked supporter for ${username}`);
      res.json({ ok: true, message: `Supporter revoked for @${username}` });
      return;
    }

    const m = typeof months === 'number' && months > 0 ? months : 1;
    const until = new Date();
    until.setMonth(until.getMonth() + m);

    // Extend from current expiry if already active
    if (profile.referralSupporterUntil && profile.referralSupporterUntil > new Date()) {
      until.setTime(profile.referralSupporterUntil.getTime());
      until.setMonth(until.getMonth() + m);
    }

    await db
      .update(userProfilesTable)
      .set({ isSupporter: true, referralSupporterUntil: until })
      .where(eq(userProfilesTable.userId, profile.userId));

    console.log(`[admin] granted supporter to ${username} until ${until.toISOString()}`);
    res.json({
      ok: true,
      message: `@${username} is now a Supporter until ${until.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      expiresAt: until.toISOString(),
    });
  } catch (err) {
    console.error('[admin] grant-supporter error:', err);
    res.status(500).json({ error: 'Failed to update supporter status' });
  }
});

// ── Grandfather badge endpoints ────────────────────────────────────────────────

// POST /api/admin/users/:userId/grandfather — grant grandfathered status
router.post('/admin/users/:userId/grandfather', async (req: Request<{ userId: string }>, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!isAdminUser(req.user.id)) { res.status(403).json({ error: 'Forbidden' }); return; }

  const { userId } = req.params;

  try {
    const profile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.userId, userId),
    });

    if (!profile) {
      res.status(404).json({ error: `No user found with id "${userId}"` });
      return;
    }

    await db
      .update(userProfilesTable)
      .set({ isGrandfathered: true, isSupporter: true })
      .where(eq(userProfilesTable.userId, userId));

    console.log(`[admin] granted grandfathered badge to ${profile.username} (${userId})`);
    res.json({ ok: true, message: `@${profile.username} is now Grandfathered — General Tier` });
  } catch (err) {
    console.error('[admin] grandfather grant error:', err);
    res.status(500).json({ error: 'Failed to grant grandfathered status' });
  }
});

// DELETE /api/admin/users/:userId/grandfather — revoke grandfathered status
router.delete('/admin/users/:userId/grandfather', async (req: Request<{ userId: string }>, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!isAdminUser(req.user.id)) { res.status(403).json({ error: 'Forbidden' }); return; }

  const { userId } = req.params;

  try {
    const profile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.userId, userId),
    });

    if (!profile) {
      res.status(404).json({ error: `No user found with id "${userId}"` });
      return;
    }

    // Determine whether to clear isSupporter:
    // - Keep if there is an active referral in the DB (accurate without Stripe call)
    // - Keep if they have a stripeCustomerId (sync-all will correct on next run if sub lapsed)
    // - Clear only if neither exists
    const hasActiveReferral = !!(profile.referralSupporterUntil && profile.referralSupporterUntil > new Date());
    const hasStripeCustomer = !!profile.stripeCustomerId;
    const keepSupporter = hasActiveReferral || hasStripeCustomer;

    await db
      .update(userProfilesTable)
      .set({ isGrandfathered: false, ...(keepSupporter ? {} : { isSupporter: false }) })
      .where(eq(userProfilesTable.userId, userId));

    console.log(`[admin] revoked grandfathered badge from ${profile.username} (${userId})`);
    res.json({ ok: true, message: `Grandfathered badge revoked from @${profile.username}` });
  } catch (err) {
    console.error('[admin] grandfather revoke error:', err);
    res.status(500).json({ error: 'Failed to revoke grandfathered status' });
  }
});

export default router;
