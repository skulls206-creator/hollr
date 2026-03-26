import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

type ConnectionSettings = { settings: { publishable: string; secret: string } };

let connectionSettings: ConnectionSettings | undefined;

async function getCredentials(): Promise<{ publishableKey: string; secretKey: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  async function fetchConnection(env: string): Promise<ConnectionSettings | undefined> {
    const url = new URL(`https://${hostname}/api/v2/connection`);
    url.searchParams.set('include_secrets', 'true');
    url.searchParams.set('connector_names', connectorName);
    url.searchParams.set('environment', env);
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken,
      },
    });
    const data = await response.json() as { items?: ConnectionSettings[] };
    return data.items?.[0];
  }

  // Try the target environment first; if it has no keys, fall back to development.
  // This handles deployments that share a single Stripe account across environments.
  connectionSettings = await fetchConnection(targetEnvironment);
  if (!connectionSettings?.settings.publishable || !connectionSettings?.settings.secret) {
    if (targetEnvironment !== 'development') {
      connectionSettings = await fetchConnection('development');
    }
  }

  if (!connectionSettings?.settings.publishable || !connectionSettings?.settings.secret) {
    throw new Error(`Stripe connection not found (tried ${targetEnvironment} + development)`);
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

// WARNING: Never cache this client. Always call fresh per request.
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover',
  });
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey(): Promise<string> {
  const { secretKey } = await getCredentials();
  return secretKey;
}

// StripeSync singleton — reset if key changes
let stripeSync: StripeSync | null = null;

export async function getStripeSync(): Promise<StripeSync> {
  if (!stripeSync) {
    const secretKey = await getStripeSecretKey();
    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
