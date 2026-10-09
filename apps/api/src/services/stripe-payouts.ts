import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-06-20',
});

export async function createPayoutIntent(amountCents: number, destination: string) {
  return {
    amountCents,
    destination,
    provider: 'stripe',
    status: 'queued',
    mode: 'simulated',
    createdAt: new Date().toISOString(),
  };
}

export async function settlePayout(amountCents: number) {
  return {
    amountCents,
    status: 'completed',
    provider: 'stripe',
    settledAt: new Date().toISOString(),
  };
}
