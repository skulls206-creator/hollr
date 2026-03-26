import Stripe from 'stripe';

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
