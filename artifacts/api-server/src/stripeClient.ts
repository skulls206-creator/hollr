import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

function getApiKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Connect the Stripe integration in Replit and restart.'
    );
  }
  return key;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  return new Stripe(getApiKey(), { apiVersion: '2025-01-27.acacia' as any });
}

let _stripeSync: StripeSync | null = null;

export async function getStripeSync(): Promise<StripeSync> {
  if (!_stripeSync) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required for Stripe sync');
    _stripeSync = new StripeSync({
      stripeSecretKey: getApiKey(),
      poolConfig: { connectionString: databaseUrl },
    });
  }
  return _stripeSync;
}
