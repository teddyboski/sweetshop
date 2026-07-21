import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createResendClient, RESEND_FROM_EMAIL } from "@/lib/resend/client";

interface ShippingAddress {
  name: string;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  };
}

/**
 * Sends the order confirmation email and throws on any failure (missing
 * order, unresolvable recipient, or the Resend API call itself failing).
 * Deliberately does NOT catch its own errors - the caller (the webhook
 * route) needs the throw to propagate so it can return a non-2xx status,
 * which is what makes Stripe redeliver the event and retry this step. See
 * the confirmation_email_sent_at migration's header comment for why a
 * naive try/catch-and-log here would silently break that retry path.
 */
export async function sendOrderConfirmationEmail(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  orderId: string
): Promise<void> {
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, user_id, guest_email, total_amount_cents, shipping_address")
    .eq("id", orderId)
    .single();
  if (orderError || !order) {
    throw orderError ?? new Error(`Order ${orderId} not found for confirmation email`);
  }

  let recipientEmail = order.guest_email;
  if (!recipientEmail && order.user_id) {
    const { data: profile } = await admin.from("profiles").select("email").eq("id", order.user_id).single();
    recipientEmail = profile?.email ?? null;
  }
  if (!recipientEmail) {
    throw new Error(`Order ${orderId} has no resolvable recipient email (no guest_email, no matching profile)`);
  }

  const { data: orderItems, error: itemsError } = await admin
    .from("order_items")
    .select("quantity, unit_price_cents, item_type, boxes(title), snacks(name)")
    .eq("order_id", orderId);
  if (itemsError) throw itemsError;

  const lineLines = (orderItems ?? []).map((item) => {
    const name = item.item_type === "box" ? (item.boxes?.title ?? "Box") : (item.snacks?.name ?? "Snack");
    const lineTotalCents = item.unit_price_cents * item.quantity;
    return `  ${item.quantity} x ${name} - $${(lineTotalCents / 100).toFixed(2)}`;
  });

  const shipping = order.shipping_address as ShippingAddress | null;
  const shippingLines = shipping
    ? [
        shipping.name,
        shipping.address.line1,
        shipping.address.line2,
        [shipping.address.city, shipping.address.state, shipping.address.postal_code].filter(Boolean).join(", "),
        shipping.address.country,
      ].filter((line): line is string => Boolean(line))
    : [];

  const shortOrderNumber = order.id.slice(0, 8);
  const textBody = [
    `Thanks for your order!`,
    ``,
    `Order #${shortOrderNumber}`,
    ``,
    `Items:`,
    ...lineLines,
    ``,
    `Total: $${(order.total_amount_cents / 100).toFixed(2)}`,
    ...(shippingLines.length > 0 ? ["", "Shipping to:", ...shippingLines] : []),
  ].join("\n");

  const resend = createResendClient();
  const { error: sendError } = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: recipientEmail,
    subject: `Your SnackBox order #${shortOrderNumber} is confirmed`,
    text: textBody,
  });
  if (sendError) {
    throw new Error(`Resend send failed for order ${orderId}: ${sendError.message}`);
  }
}
