import { authenticatedFetch } from "./authenticated-fetch";

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

/**
 * Milestone 14: every function here targets a new GET /api/account/* route
 * added specifically to close the same gap Milestone 12 closed for catalog
 * and Milestone 13 closed for cart - web reads all of this in Server
 * Components, which a mobile client can't reach. Field names match
 * queries/account.ts's own camelCase output exactly, so these types are a
 * direct mirror, not a re-derivation.
 */

export interface OrderSummary {
  id: string;
  status: string;
  totalAmountCents: number;
  trackingNumber: string | null;
  createdAt: string;
  itemCount: number;
}

export interface OrderLineItem {
  id: string;
  itemType: string;
  quantity: number;
  unitPriceCents: number;
  name: string;
  snackSelections?: Array<{ snackId: string; name: string; quantity: number }>;
}

export interface OrderDetail {
  id: string;
  status: string;
  totalAmountCents: number;
  trackingNumber: string | null;
  shippingAddress: unknown;
  createdAt: string;
  items: OrderLineItem[];
}

export interface SubscriptionSummary {
  id: string;
  status: string;
  nextDeliveryAt: string | null;
  stripeSubscriptionId: string | null;
  boxTitle: string;
  cadence: string | null;
}

export interface RewardsLedgerEntry {
  id: string;
  deltaPoints: number;
  reason: string;
  orderId: string | null;
  createdAt: string;
}

export interface RewardsSummary {
  balance: number;
  ledger: RewardsLedgerEntry[];
}

export interface ReferralStatus {
  id: string;
  status: string;
  rewardIssuedAt: string | null;
  createdAt: string;
}

export interface ReferralsSummary {
  referralCode: string;
  referralLink: string;
  referrals: ReferralStatus[];
}

export async function fetchOrders(): Promise<OrderSummary[]> {
  const response = await authenticatedFetch("/api/account/orders");
  return unwrapEnvelope<OrderSummary[]>(response);
}

export async function fetchOrderDetail(orderId: string): Promise<OrderDetail> {
  const response = await authenticatedFetch(`/api/account/orders/${encodeURIComponent(orderId)}`);
  return unwrapEnvelope<OrderDetail>(response);
}

export async function fetchSubscriptions(): Promise<SubscriptionSummary[]> {
  const response = await authenticatedFetch("/api/account/subscriptions");
  return unwrapEnvelope<SubscriptionSummary[]>(response);
}

export async function fetchRewards(): Promise<RewardsSummary> {
  const response = await authenticatedFetch("/api/account/rewards");
  return unwrapEnvelope<RewardsSummary>(response);
}

export async function fetchReferrals(): Promise<ReferralsSummary> {
  const response = await authenticatedFetch("/api/account/referrals");
  return unwrapEnvelope<ReferralsSummary>(response);
}

/**
 * Reuses POST /api/account/subscriptions/portal-session as-is (Milestone 7,
 * already bearer-token-authenticated) - see CheckoutScreen's identical
 * expo-web-browser fallback pattern from Milestone 13 for why this doesn't
 * need a native subscription-management UI of its own.
 */
export async function createSubscriptionPortalSession(): Promise<{ url: string }> {
  const response = await authenticatedFetch("/api/account/subscriptions/portal-session", { method: "POST" });
  return unwrapEnvelope<{ url: string }>(response);
}
