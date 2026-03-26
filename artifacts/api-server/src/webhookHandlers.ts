import { getStripeSync } from './stripeClient';
import { db } from '@workspace/db';
import { userProfilesTable } from '@workspace/db/schema';
import { eq, sql as drizzleSql } from 'drizzle-orm';

const SUPPORTER_PRODUCT_NAME = 'hollr Supporter';

async function syncSupporterStatusForCustomer(stripeCustomerId: string) {
  try {
    // Check if ANY active/trialing subscription for the 'hollr Supporter' product exists.
    // Using EXISTS so a customer with multiple subscriptions is handled correctly.
    const result = await db.execute(
      drizzleSql`
        SELECT EXISTS (
          SELECT 1
          FROM stripe.subscriptions s
          JOIN stripe.subscription_items si ON si.subscription = s.id
          JOIN stripe.prices pr ON pr.id = si.price
          JOIN stripe.products p ON p.id = pr.product
          WHERE s.customer = ${stripeCustomerId}
            AND p.name = ${SUPPORTER_PRODUCT_NAME}
            AND p.active = true
            AND s.status IN ('active', 'trialing')
        ) AS is_active
      `
    );
    const row = result.rows[0] as { is_active?: boolean } | undefined;
    const isActive = row?.is_active === true;

    await db
      .update(userProfilesTable)
      .set({ isSupporter: isActive })
      .where(eq(userProfilesTable.stripeCustomerId, stripeCustomerId));
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

    // Let stripe-replit-sync process and sync data to stripe.* tables first
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
