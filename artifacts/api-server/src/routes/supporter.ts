import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { userProfilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient";

const router: IRouter = Router();

const PRODUCT_NAME = 'hollr Supporter';

function getAppBaseUrl(): string {
  const domain = (process.env.REPLIT_DOMAINS ?? '').split(',')[0].trim();
  if (domain) return `https://${domain}`;
  return 'http://localhost:3000';
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
  if (!product) return [];

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

    res.json({
      isSupporter: profile?.isSupporter ?? false,
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

export default router;
