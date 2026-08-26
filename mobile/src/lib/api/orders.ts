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

export interface OrderConfirmationLineItem {
  id: string;
  itemType: string;
  quantity: number;
  unitPriceCents: number;
  name: string;
  snackSelections?: Array<{ snackId: string; name: string; quantity: number }>;
}

export interface OrderConfirmation {
  id: string;
  status: string;
  totalAmountCents: number;
  createdAt: string;
  items: OrderConfirmationLineItem[];
}

export interface OrderConfirmationResult {
  status: "ready" | "pending";
  order: OrderConfirmation | null;
}

/**
 * cartFetch (not authenticatedFetch) reused here purely for its
 * X-Anonymous-Cart-Id plumbing convenience - this endpoint doesn't actually
 * need that header (order lookup is by paymentIntentId alone, see the
 * route's own header comment on why no auth check gates it), but cartFetch
 * is a strict superset of authenticatedFetch's behavior, so reusing it here
 * avoids a third near-identical fetch wrapper for one call site.
 */
export async function fetchOrderConfirmation(paymentIntentId: string): Promise<OrderConfirmationResult> {
  const response = await cartFetch(`/api/orders/by-payment-intent/${encodeURIComponent(paymentIntentId)}`);
  return unwrapEnvelope<OrderConfirmationResult>(response);
}
