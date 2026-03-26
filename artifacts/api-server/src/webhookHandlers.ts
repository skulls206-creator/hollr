import { getStripeSync } from './stripeClient';
import { db } from '@workspace/db';
import { userProfilesTable } from '@workspace/db/schema';
import { eq, sql as drizzleSql } from 'drizzle-orm';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const SUPPORTER_PRODUCT_NAME = 'hollr Supporter';

async function syncSupporterStatusForCustomer(stripeCustomerId: string) {
  try {
    // Only count active subscriptions for the 'hollr Supporter' product,
    // not any other product the customer may have.
    const result = await db.execute(
      drizzleSql`
        SELECT s.status
        FROM stripe.subscriptions s
        JOIN stripe.subscription_items si ON si.subscription = s.id
        JOIN stripe.prices pr ON pr.id = si.price
        JOIN stripe.products p ON p.id = pr.product
        WHERE s.customer = ${stripeCustomerId}
          AND p.name = ${SUPPORTER_PRODUCT_NAME}
          AND p.active = true
        ORDER BY s.created DESC
        LIMIT 1
      `
    );
    const row = result.rows[0] as { status?: string } | undefined;
    const isActive = !!row && ACTIVE_STATUSES.has(row.status ?? '');

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
      const rawEvent = JSON.parse(payload.toString('utf8'));
      const eventType: string = rawEvent?.type ?? '';
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
        const customerId: string = typeof obj.customer === 'string' ? obj.customer : (obj.customer?.id ?? '');
        if (customerId) {
          await syncSupporterStatusForCustomer(customerId);
        }
      }
    } catch (parseErr) {
      console.warn('[webhookHandlers] could not parse event for supporter sync:', parseErr);
    }
  }
}
