import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatPriceCents, formatDate } from "@/lib/utils";
import { OrderActions } from "@/components/features/admin/order-actions";

export const dynamic = "force-dynamic";

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  const { id } = await params;
  const admin = createAdminSupabaseClient();

  const { data: order } = await admin
    .from("orders")
    .select(
      "id, user_id, guest_email, status, total_amount_cents, tracking_number, shipping_address, stripe_payment_intent_id, created_at"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!order) notFound();

  const { data: items } = await admin
    .from("order_items")
    .select("id, item_type, quantity, unit_price_cents, boxes(title), snacks(name)")
    .eq("order_id", id);

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl font-semibold">Order {order.id}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {order.guest_email ?? order.user_id} - placed {formatDate(order.created_at)}
      </p>

      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="font-heading text-lg font-semibold">Line items</h2>
          <div className="mt-2 divide-y rounded-lg border">
            {(items ?? []).map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  {item.quantity}x {item.boxes?.title ?? item.snacks?.name ?? item.item_type}
                </span>
                <span>{formatPriceCents(item.unit_price_cents * item.quantity)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-right text-sm font-medium">Total: {formatPriceCents(order.total_amount_cents)}</p>
        </div>

        <div>
          <h2 className="font-heading text-lg font-semibold">Status: {order.status}</h2>
          <div className="mt-2 rounded-lg border p-4">
            <OrderActions
              orderId={order.id}
              status={order.status}
              trackingNumber={order.tracking_number}
              hasPaymentIntent={Boolean(order.stripe_payment_intent_id)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
