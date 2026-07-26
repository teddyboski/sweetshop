import "server-only";
import Stripe from "stripe";

let cached: Stripe | undefined;

/**
 * Singleton, same rationale as the public Supabase client cache: avoid
 * constructing a new SDK instance (and its underlying HTTP agent) on every
 * call within a single request/process.
 */
export function createStripeClient(): Stripe {
  if (!cached) {
    cached = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return cached;
}
