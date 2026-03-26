import { getUncachableStripeClient } from './stripeClient.js';

const PRODUCT_NAME = 'hollr Supporter';

async function seedSupporterProducts() {
  const stripe = await getUncachableStripeClient();
  console.log('Checking for existing hollr Supporter product...');

  const existing = await stripe.products.search({
    query: `name:'${PRODUCT_NAME}' AND active:'true'`,
  });

  let product;
  if (existing.data.length > 0) {
    product = existing.data[0];
    console.log(`Product already exists: ${product.name} (${product.id})`);
  } else {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      description: 'A glowing diamond badge next to your name everywhere in hollr.',
    });
    console.log(`Created product: ${product.name} (${product.id})`);
  }

  // Check existing prices for this product
  const existingPrices = await stripe.prices.list({
    product: product.id,
    active: true,
  });

  const hasMonthly = existingPrices.data.some(
    p => p.recurring?.interval === 'month' && (p.unit_amount ?? 0) === 100
  );
  const hasYearly = existingPrices.data.some(
    p => p.recurring?.interval === 'year' && (p.unit_amount ?? 0) === 1000
  );

  if (hasMonthly) {
    console.log('Monthly price ($1.00/month) already exists — skipping.');
  } else {
    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: 100,
      currency: 'usd',
      recurring: { interval: 'month' },
    });
    console.log(`Created monthly price: $1.00/month (${monthly.id})`);
  }

  if (hasYearly) {
    console.log('Yearly price ($10.00/year) already exists — skipping.');
  } else {
    const yearly = await stripe.prices.create({
      product: product.id,
      unit_amount: 1000,
      currency: 'usd',
      recurring: { interval: 'year' },
    });
    console.log(`Created yearly price: $10.00/year (${yearly.id})`);
  }

  console.log('\nDone! Products and prices ready in Stripe.');
  console.log('Run the server and Stripe webhooks will sync them to the database automatically.');
}

seedSupporterProducts().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
