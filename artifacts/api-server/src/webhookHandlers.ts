import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { db } from '@workspace/db';
import { userProfilesTable } from '@workspace/db/schema';
import { eq } from 'drizzle-orm';

const SUPPORTER_PRODUCT_NAME = 'hollr Supporter';

/**
 * Check via Stripe API (not the local synced tables) whether a customer
 * currently has an active/trialing hollr Supporter subscription.
 * Falls back to false on any error.
 */
async function syncSupporterStatusForCustomer(stripeCustomerId: string) {
  try {
    const stripe = await getUncachableStripeClient();

    // List active/trialing subscriptions for this customer
    const [subscriptions, trialingSubscriptions] = await Promise.all([
      stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'active',
        limit: 20,
        expand: ['data.items.data.price.product'],
      }),
      stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'trialing',
        limit: 20,
        expand: ['data.items.data.price.product'],
      }),
    ]);

    const allSubs = [...subscriptions.data, ...trialingSubscriptions.data];

    const hasPaidSub = allSubs.some(sub =>
      sub.items.data.some(item => {
        const product = item.price?.product as { name?: string; active?: boolean } | null;
        return product && product.active && product.name === SUPPORTER_PRODUCT_NAME;
      })
    );

    // Look up the user's referral grant so we don't clobber it.
    // isSupporter = true if EITHER the paid sub is active OR the referral grant has not expired.
    const userProfile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.stripeCustomerId, stripeCustomerId),
      columns: { referralSupporterUntil: true },
    });

    const now = new Date();
    const hasActiveReferral =
      userProfile?.referralSupporterUntil != null &&
      userProfile.referralSupporterUntil > now;

    const isSupporter = hasPaidSub || hasActiveReferral;

    await db
      .update(userProfilesTable)
      .set({ isSupporter })
      .where(eq(userProfilesTable.stripeCustomerId, stripeCustomerId));

    console.log(
      `[webhookHandlers] supporter status for ${stripeCustomerId}: ${isSupporter}` +
      ` (paid=${hasPaidSub}, referral=${hasActiveReferral})`
    );
  } catch (err) {
    console.error('[webhookHandlers] syncSupporterStatus error:', err);
  }
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    // Let stripe-replit-sync process and sync data to stripe.* tables
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // After sync, parse the event to update our own user_profiles.is_supporter
    try {
      const rawEvent = JSON.parse(payload.toString('utf8')) as {
        type?: string;
        data?: { object?: { customer?: string | { id?: string } } };
      };
      const eventType = rawEvent?.type ?? '';
      const obj = rawEvent?.data?.object ?? {};

      const SUBSCRIPTION_EVENTS = new Set([
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'customer.subscription.paused',
        'customer.subscription.resumed',
        'invoice.payment_failed',
        'invoice.payment_succeeded',
      ]);

      if (SUBSCRIPTION_EVENTS.has(eventType)) {
        const customer = obj.customer;
        const customerId: string = typeof customer === 'string' ? customer : (customer?.id ?? '');
        if (customerId) {
          await syncSupporterStatusForCustomer(customerId);
        }
      }
    } catch (parseErr) {
      console.warn('[webhookHandlers] could not parse event for supporter sync:', parseErr);
    }
  }
}
