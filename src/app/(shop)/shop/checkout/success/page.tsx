import Link from "next/link";
import { notFound } from "next/navigation";
import { createStripeClient } from "@/lib/stripe/client";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatPriceCents } from "@/lib/utils";

// Never statically generated - every visit is a unique completed purchase.
export const dynamic = "force-dynamic";

/**
 * Deliberately sources its content from the Stripe session directly rather
 * than from our own orders row. Stripe redirects the browser here the
 * moment the customer finishes paying, but the order-creating webhook
 * (checkout.session.completed) is a separate, asynchronous delivery that
 * can arrive seconds later - reading only from our own DB would risk a
 * blank/broken confirmation page on a page load that beats the webhook.
 * The order id is still shown when it's already available, as a bonus, not
 * a requirement.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  if (!sessionId) notFound();

  const stripe = createStripeClient();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
  } catch {
    notFound();
  }

  // A session that isn't actually paid/complete (e.g. a hand-crafted URL,
  // or the customer navigated back after cancelling) shouldn't render a
  // fake confirmation.
  if (session.status !== "complete") notFound();

  const admin = createAdminSupabaseClient();
  const { data: order } = await admin
    .from("orders")
    .select("id")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();

  const lineItems = session.line_items?.data ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-heading text-2xl font-semibold">Thanks for your order!</h1>
      <p className="mt-2 text-muted-foreground">
        {order
          ? `Order #${order.id.slice(0, 8)}`
          : "We're finishing up your order - refresh this page in a moment for your order number."}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        A confirmation email is on its way to {session.customer_details?.email ?? "your email address"}.
      </p>

      <div className="mt-6 space-y-2 rounded-lg border p-4 text-left">
        {lineItems.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span>
              {item.quantity} x {item.description}
            </span>
            <span>{formatPriceCents(item.amount_total)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t pt-2 font-medium">
          <span>Total</span>
          <span>{formatPriceCents(session.amount_total ?? 0)}</span>
        </div>
      </div>

      <Link href="/shop" className="mt-6 inline-block text-primary underline underline-offset-4">
        Continue shopping
      </Link>
    </div>
  );
}
