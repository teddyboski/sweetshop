import { notFound } from "next/navigation";
import { getCustomerDetail } from "@/lib/supabase/queries/admin-customers";
import { formatPriceCents, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface AdminCustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminCustomerDetailPage({ params }: AdminCustomerDetailPageProps) {
  const { id } = await params;
  const customer = await getCustomerDetail(id);
  if (!customer) notFound();

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl font-semibold">{customer.email}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {customer.role} - joined {formatDate(customer.createdAt)} - {customer.rewardsPoints} rewards points
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border p-4 text-sm">
          <h2 className="font-heading font-semibold">Lifetime value</h2>
          <p className="mt-2 text-muted-foreground">Total orders: {customer.lifetimeValue.totalOrders}</p>
          <p className="text-muted-foreground">Total spend: {formatPriceCents(customer.lifetimeValue.totalSpendCents)}</p>
          <p className="text-muted-foreground">
            Avg order value: {formatPriceCents(customer.lifetimeValue.avgOrderValueCents)}
          </p>
          {customer.lifetimeValue.firstOrderAt && (
            <p className="text-muted-foreground">First order: {formatDate(customer.lifetimeValue.firstOrderAt)}</p>
          )}
          {customer.lifetimeValue.lastOrderAt && (
            <p className="text-muted-foreground">Last order: {formatDate(customer.lifetimeValue.lastOrderAt)}</p>
          )}
        </div>

        <div className="rounded-lg border p-4 text-sm">
          <h2 className="font-heading font-semibold">Preferences</h2>
          {customer.preferences ? (
            <>
              <p className="mt-2 text-muted-foreground">
                Dietary: {customer.preferences.dietaryRestrictions.join(", ") || "none"}
              </p>
              <p className="text-muted-foreground">
                Disliked: {customer.preferences.dislikedCategories.join(", ") || "none"}
              </p>
              <p className="text-muted-foreground">
                Flavor profile: {customer.preferences.flavorProfile.join(", ") || "none"}
              </p>
              <p className="text-muted-foreground">Spice tolerance: {customer.preferences.spiceTolerance ?? "unset"}</p>
              <p className="text-muted-foreground">
                Marketing opt-in: {customer.preferences.marketingOptIn ? "yes" : "no"}
              </p>
            </>
          ) : (
            <p className="mt-2 text-muted-foreground">No preferences set yet.</p>
          )}
        </div>
      </div>

      <h2 className="mt-8 font-heading text-lg font-semibold">Recent orders</h2>
      <div className="mt-2 divide-y rounded-lg border">
        {customer.recentOrders.map((order) => (
          <div key={order.id} className="flex items-center justify-between p-3 text-sm">
            <span>
              {order.id.slice(0, 8)} - {order.status} - {formatDate(order.createdAt)}
            </span>
            <span className="font-medium">{formatPriceCents(order.totalAmountCents)}</span>
          </div>
        ))}
        {customer.recentOrders.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No orders yet.</p>
        )}
      </div>

      <h2 className="mt-8 font-heading text-lg font-semibold">Recent activity</h2>
      <div className="mt-2 divide-y rounded-lg border">
        {customer.recentActivity.map((activity) => (
          <div key={activity.id} className="flex items-center justify-between p-3 text-sm">
            <span>{activity.eventType}</span>
            <span className="text-muted-foreground">{formatDate(activity.createdAt)}</span>
          </div>
        ))}
        {customer.recentActivity.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No activity logged yet.</p>
        )}
      </div>
    </div>
  );
}
