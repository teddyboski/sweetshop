import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOrderDetail } from "@/lib/supabase/queries/account";
import { formatPriceCents, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  fulfilled: "Fulfilled",
  shipped: "Shipped",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

interface ShippingAddressSnapshot {
  name?: string;
  address?: {
    line1?: string;
    line2?: string | null;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
}

function isShippingAddressSnapshot(value: unknown): value is ShippingAddressSnapshot {
  return typeof value === "object" && value !== null;
}

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AccountOrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // getOrderDetail returns null for both "no such order" and "belongs to
  // someone else" - see its own header comment (Milestone 7, Task 1). Both
  // become a 404 here, never a 403, so a guessed id never confirms it exists
  // in someone else's account.
  const order = await getOrderDetail(id, user.id);
  if (!order) notFound();

  const shipping = isShippingAddressSnapshot(order.shippingAddress) ? order.shippingAddress : null;

  return (
    <div className="max-w-2xl">
      <Link href="/account/orders" className="text-sm text-primary underline underline-offset-4">
        Back to orders
      </Link>

      <h1 className="mt-2 font-heading text-2xl font-semibold">Order #{order.id.slice(0, 8)}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Placed {formatDate(order.createdAt)}</p>
      <p className="mt-1 text-sm">
        Status: <span className="font-medium">{STATUS_LABELS[order.status] ?? order.status}</span>
      </p>
      {order.trackingNumber && (
        <p className="mt-1 text-sm">
          Tracking: <span className="font-medium">{order.trackingNumber}</span>
        </p>
      )}

      <div className="mt-6 divide-y rounded-lg border">
        {order.items.map((item) => (
          <div key={item.id} className="p-4">
            <div className="flex justify-between text-sm">
              <span>
                {item.quantity} x {item.name}
              </span>
              <span>{formatPriceCents(item.unitPriceCents * item.quantity)}</span>
            </div>
            {item.snackSelections && item.snackSelections.length > 0 && (
              <ul className="mt-2 space-y-0.5 pl-4 text-xs text-muted-foreground">
                {item.snackSelections.map((selection) => (
                  <li key={selection.snackId}>
                    {selection.quantity} x {selection.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <div className="flex justify-between p-4 font-medium">
          <span>Total</span>
          <span>{formatPriceCents(order.totalAmountCents)}</span>
        </div>
      </div>

      {shipping?.address && (
        <div className="mt-6 rounded-lg border p-4 text-sm">
          <p className="font-medium">Shipping address</p>
          <p className="mt-1 text-muted-foreground">
            {shipping.name}
            <br />
            {shipping.address.line1}
            {shipping.address.line2 ? <>, {shipping.address.line2}</> : null}
            <br />
            {shipping.address.city}, {shipping.address.state} {shipping.address.postal_code}
            <br />
            {shipping.address.country}
          </p>
        </div>
      )}
    </div>
  );
}
