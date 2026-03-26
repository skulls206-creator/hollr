import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { userProfilesTable } from "@workspace/db/schema";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient";

const router: IRouter = Router();

function getAppBaseUrl(): string {
  const domain = (process.env.REPLIT_DOMAINS ?? '').split(',')[0].trim();
  if (domain) return `https://${domain}`;
  return 'http://localhost:3000';
}

async function getSupporterPriceIds(): Promise<Set<string>> {
  try {
    const result = await db.execute(
      drizzleSql`
        SELECT pr.id as price_id
        FROM stripe.products p
        JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.name = 'hollr Supporter' AND p.active = true
      `
    );
    return new Set((result.rows as Array<{ price_id: string }>).map(r => r.price_id));
  } catch {
    return new Set();
  }
}

// GET /api/supporter/status — returns supporter status for the current user
router.get('/supporter/status', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, req.user.id),
  });

  res.json({
    isSupporter: profile?.isSupporter ?? false,
    hasCustomerId: !!(profile?.stripeCustomerId),
  });
});

// GET /api/supporter/prices — return monthly + yearly price IDs from Stripe
router.get('/supporter/prices', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const result = await db.execute(
      drizzleSql`
        SELECT pr.id as price_id, pr.unit_amount, pr.currency, pr.recurring
        FROM stripe.products p
        JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.name = 'hollr Supporter' AND p.active = true
        ORDER BY pr.unit_amount ASC
      `
    );
    res.json({ prices: result.rows });
  } catch {
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

  // Server-side validate: priceId must be one of the known hollr Supporter prices
  const allowedPriceIds = await getSupporterPriceIds();
  if (!allowedPriceIds.has(priceId)) {
    res.status(400).json({ error: 'Invalid priceId — not a supporter price' });
    return;
  }

  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, req.user.id),
  });

  const stripe = await getUncachableStripeClient();

  let customerId = profile?.stripeCustomerId ?? null;
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
});

// POST /api/supporter/portal — create a Stripe billing portal session
router.post('/supporter/portal', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

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
});

export default router;
