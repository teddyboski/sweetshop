import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Milestone 13 (mobile): order confirmation lookup for the native Payment
 * Sheet flow. Deliberately NOT scoped to a caller's user_id, unlike
 * getOrderDetail in queries/account.ts - mirrors
 * (shop)/shop/checkout/success/page.tsx's own security model exactly: a
 * Stripe-generated identifier (there a Checkout Session id, here a
 * PaymentIntent id) is itself the access credential, the same way that page
 * trusts a `session_id` query param without a login check. Both ids are
 * long, random, and returned only to the customer who made the payment -
 * guessing one isn't a realistic attack, and this is what lets a mobile
 * guest checkout (no account, no bearer token at all) see their own order
 * confirmation. See the route handler for the rate-limit tier chosen partly
 * because of this trust model.
 */

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

export async function getOrderByPaymentIntentId(paymentIntentId: string): Promise<OrderConfirmation | null> {
  const admin = createAdminSupabaseClient();

  const { data: order, error } = await admin
    .from("orders")
    .select("id, status, total_amount_cents, created_at")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("id, item_type, quantity, unit_price_cents, boxes(title, box_type), snacks(name)")
    .eq("order_id", order.id);
  if (itemsError) throw itemsError;

  const lineItems: OrderConfirmationLineItem[] = [];
  for (const item of items ?? []) {
    let snackSelections: OrderConfirmationLineItem["snackSelections"];

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
    createdAt: order.created_at,
    items: lineItems,
  };
}
