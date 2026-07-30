import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOrdersForUser } from "@/lib/supabase/queries/account";
import { formatPriceCents, formatDate } from "@/lib/utils";

// Order status/tracking can change any time (Milestone 8's admin fulfillment
// job) - never statically generated or ISR'd.
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  fulfilled: "Fulfilled",
  shipped: "Shipped",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export default async function AccountOrdersPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orders = await getOrdersForUser(user.id);

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-semibold">Order History</h1>

      {orders.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">You haven&apos;t placed any orders yet.</p>
      ) : (
        <div className="mt-6 divide-y rounded-lg border">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/account/orders/${order.id}`}
              className="flex items-center justify-between p-4 hover:bg-muted"
            >
              <div>
                <p className="font-medium">Order #{order.id.slice(0, 8)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(order.createdAt)} - {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatPriceCents(order.totalAmountCents)}</p>
                <p className="text-sm text-muted-foreground">{STATUS_LABELS[order.status] ?? order.status}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
