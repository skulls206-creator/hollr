import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { userProfilesTable } from "@workspace/db/schema";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { getUncachableStripeClient } from "../stripeClient";

const router: IRouter = Router();

function getAppBaseUrl(req: any): string {
  const proto = req.headers['x-forwarded-proto'] ?? req.protocol ?? 'https';
  const host = req.headers['x-forwarded-host'] ?? req.get('host') ?? '';
  return `${proto}://${host}`;
}

// GET /api/supporter/status — returns supporter status for the current user
router.get('/supporter/status', async (req: any, res) => {
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
router.get('/supporter/prices', async (req: any, res) => {
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
router.post('/supporter/checkout', async (req: any, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { priceId, interval } = req.body;
  if (!priceId) {
    res.status(400).json({ error: 'priceId is required' });
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

  const appUrl = getAppBaseUrl(req);
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
router.post('/supporter/portal', async (req: any, res) => {
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
  const appUrl = getAppBaseUrl(req);
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: `${appUrl}/`,
  });

  res.json({ url: portalSession.url });
});

export default router;
