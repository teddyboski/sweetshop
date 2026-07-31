import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatPriceCents, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface AdminOrdersPageProps {
  searchParams: Promise<{ status?: string }>;
}

const STATUSES = ["pending", "paid", "fulfilled", "shipped", "cancelled", "refunded"];

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const { status } = await searchParams;
  const admin = createAdminSupabaseClient();

  let query = admin
    .from("orders")
    .select("id, status, total_amount_cents, tracking_number, guest_email, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);

  const { data: orders } = await query;

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Orders</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/orders"
          className={`rounded-md border px-2.5 py-1 text-xs ${!status ? "bg-muted font-medium" : ""}`}
        >
          All
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/orders?status=${s}`}
            className={`rounded-md border px-2.5 py-1 text-xs capitalize ${status === s ? "bg-muted font-medium" : ""}`}
          >
            {s}
          </Link>
        ))}
      </div>

      <div className="mt-4 divide-y rounded-lg border">
        {(orders ?? []).map((order) => (
          <Link
            key={order.id}
            href={`/admin/orders/${order.id}`}
            className="flex items-center justify-between p-4 text-sm hover:bg-muted"
          >
            <div>
              <p className="font-medium">{order.id}</p>
              <p className="text-muted-foreground">
                {order.status} - {formatDate(order.created_at)}
                {order.tracking_number ? ` - ${order.tracking_number}` : ""}
              </p>
            </div>
            <span className="font-medium">{formatPriceCents(order.total_amount_cents)}</span>
          </Link>
        ))}
        {(orders ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">No orders found.</p>}
      </div>
    </div>
  );
}
