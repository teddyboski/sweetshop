import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Data-access layer for the (account) route group. Every function here is
 * explicitly scoped to a caller-supplied userId (resolved server-side from
 * the authenticated session, never client input) - the admin client bypasses
 * RLS, so the .eq("user_id", ...) / .eq("referrer_id", ...) filter on each
 * query below IS the access control, not a convenience filter. RLS on these
 * tables remains a defense-in-depth backstop, per Milestone 7's plan.
 *
 * getOrderDetail additionally does an explicit code-level ownership check
 * (not just a WHERE filter) because an order is looked up by its own id -
 * the same pattern as loadOwnedCartItem in
 * src/app/api/cart/items/[id]/route.ts (Milestone 5): a missing row and a
 * row owned by someone else are indistinguishable to the caller, both
 * return null here, which callers turn into a 404, never a 403.
 */

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderSummary {
  id: string;
  status: string;
  totalAmountCents: number;
  trackingNumber: string | null;
  createdAt: string;
  itemCount: number;
}

export async function getOrdersForUser(userId: string): Promise<OrderSummary[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("orders")
    .select("id, status, total_amount_cents, tracking_number, created_at, order_items(id)")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((order) => ({
    id: order.id,
    status: order.status,
    totalAmountCents: order.total_amount_cents,
    trackingNumber: order.tracking_number,
    createdAt: order.created_at,
    itemCount: order.order_items?.length ?? 0,
  }));
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

export async function getOrderDetail(orderId: string, userId: string): Promise<OrderDetail | null> {
  const admin = createAdminSupabaseClient();

  const { data: order, error } = await admin
    .from("orders")
    .select("id, user_id, status, total_amount_cents, tracking_number, shipping_address, created_at")
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;

  // Ownership check in code, not just RLS-trusted - see header comment.
  if (!order || order.user_id !== userId) return null;

  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("id, item_type, quantity, unit_price_cents, boxes(title, box_type), snacks(name)")
    .eq("order_id", orderId);
  if (itemsError) throw itemsError;

  const lineItems: OrderLineItem[] = [];
  for (const item of items ?? []) {
    let snackSelections: OrderLineItem["snackSelections"];

    if (item.item_type === "box" && item.boxes?.box_type === "build_a_box") {
      const { data: selections, error: selectionsError } = await admin
        .from("order_item_snacks")
        .select("snack_id, quantity, snacks(name)")
        .eq("order_item_id", item.id);
      if (selectionsError) throw selectionsError;

      snackSelections = (selections ?? []).map((s) => ({
        snackId: s.snack_id,
        name: s.snacks?.name ?? "Unknown snack",
        quantity: s.quantity,
      }));
    }

    lineItems.push({
      id: item.id,
      itemType: item.item_type,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      name: item.item_type === "box" ? (item.boxes?.title ?? "Unknown box") : (item.snacks?.name ?? "Unknown snack"),
      snackSelections,
    });
  }

  return {
    id: order.id,
    status: order.status,
    totalAmountCents: order.total_amount_cents,
    trackingNumber: order.tracking_number,
    shippingAddress: order.shipping_address,
    createdAt: order.created_at,
    items: lineItems,
  };
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export interface SubscriptionSummary {
  id: string;
  status: string;
  nextDeliveryAt: string | null;
  stripeSubscriptionId: string | null;
  boxTitle: string;
  cadence: string | null;
}

export async function getSubscriptionsForUser(userId: string): Promise<SubscriptionSummary[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select("id, status, next_delivery_at, stripe_subscription_id, created_at, boxes(title, cadence)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((sub) => ({
    id: sub.id,
    status: sub.status,
    nextDeliveryAt: sub.next_delivery_at,
    stripeSubscriptionId: sub.stripe_subscription_id,
    boxTitle: sub.boxes?.title ?? "Unknown box",
    cadence: sub.boxes?.cadence ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export interface CustomerPreferences {
  dietaryRestrictions: string[];
  dislikedCategories: string[];
  flavorProfile: string[];
  spiceTolerance: string | null;
  marketingOptIn: boolean;
}

// customer_preferences has no auto-provisioning trigger (unlike profiles) -
// a user who has never visited /account/preferences legitimately has no row
// yet, so null (not a default-filled object) is the correct "no data" signal.
export async function getPreferences(userId: string): Promise<CustomerPreferences | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("customer_preferences")
    .select("dietary_restrictions, disliked_categories, flavor_profile, spice_tolerance, marketing_opt_in")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    dietaryRestrictions: data.dietary_restrictions,
    dislikedCategories: data.disliked_categories,
    flavorProfile: data.flavor_profile,
    spiceTolerance: data.spice_tolerance,
    marketingOptIn: data.marketing_opt_in,
  };
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export interface CustomerAddress {
  id: string;
  label: string | null;
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export async function getAddresses(userId: string): Promise<CustomerAddress[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("customer_addresses")
    .select("id, label, recipient_name, line1, line2, city, state, postal_code, country, is_default")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((address) => ({
    id: address.id,
    label: address.label,
    recipientName: address.recipient_name,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postalCode: address.postal_code,
    country: address.country,
    isDefault: address.is_default,
  }));
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export interface RewardsLedgerEntry {
  id: string;
  deltaPoints: number;
  reason: string;
  orderId: string | null;
  createdAt: string;
}

export async function getRewardsLedger(userId: string): Promise<RewardsLedgerEntry[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("rewards_ledger")
    .select("id, delta_points, reason, order_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((entry) => ({
    id: entry.id,
    deltaPoints: entry.delta_points,
    reason: entry.reason,
    orderId: entry.order_id,
    createdAt: entry.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export interface ReferralStatus {
  id: string;
  status: string;
  rewardIssuedAt: string | null;
  createdAt: string;
}

// "Friends you've referred" is from the referrer's side (Product Decision #1
// in the Milestone 7 plan) - legitimately empty for every user until
// Milestone 9 adds signup-side capture, which is expected, not a bug.
export async function getReferralsForUser(userId: string): Promise<ReferralStatus[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("referrals")
    .select("id, status, reward_issued_at, created_at")
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((referral) => ({
    id: referral.id,
    status: referral.status,
    rewardIssuedAt: referral.reward_issued_at,
    createdAt: referral.created_at,
  }));
}
