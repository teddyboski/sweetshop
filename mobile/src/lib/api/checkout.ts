import { cartFetch } from "./cart";

interface Envelope<T> {
  data: T | null;
  error: { message: string } | null;
}

async function unwrapEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? `Request failed with status ${response.status}`);
  }
  return body.data as T;
}

export interface ShippingAddressInput {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
}

interface CreatePaymentIntentInput {
  guestEmail?: string;
  shippingAddress: ShippingAddressInput;
}

interface CreatePaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

/**
 * One-time-purchase-only native checkout (Milestone 13 scope decision) -
 * mirrors /api/checkout/payment-intent/route.ts's request shape exactly.
 * The server rejects any cart containing a subscription line, which is why
 * CheckoutScreen never calls this for a subscription-containing cart in the
 * first place (see createCheckoutSession below for that path instead).
 */
export async function createPaymentIntent(input: CreatePaymentIntentInput): Promise<CreatePaymentIntentResult> {
  const response = await cartFetch("/api/checkout/payment-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return unwrapEnvelope<CreatePaymentIntentResult>(response);
}

interface CreateCheckoutSessionResult {
  url: string;
  id: string;
}

/**
 * Subscription fallback (Milestone 13 scope decision): reuses the exact
 * same /api/checkout/session endpoint the web app's cart page calls -
 * same hosted Stripe Checkout page, same shipping-address collection Stripe
 * handles itself, same webhook (checkout.session.completed) already live in
 * production. Mobile's only role here is opening the returned url in an
 * in-app browser tab (see CheckoutScreen) - no new backend logic at all for
 * this path, on purpose, since subscriptions aren't in scope for the native
 * Payment Sheet yet.
 */
export async function createCheckoutSession(guestEmail?: string): Promise<CreateCheckoutSessionResult> {
  const response = await cartFetch("/api/checkout/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(guestEmail ? { guestEmail } : {}),
  });
  return unwrapEnvelope<CreateCheckoutSessionResult>(response);
}
