import {
  getSalesToday,
  getOrdersAwaitingFulfillmentCount,
  getLowStockSnacks,
  getActiveSubscriptionsCount,
  getCustomerGrowth,
  getRepeatPurchaseRate,
  getReferralMetrics,
  getRevenueTrends,
} from "@/lib/supabase/queries/admin-dashboard";
import { formatPriceCents } from "@/lib/utils";

// Every number here changes constantly as orders/customers/inventory
// change - never statically generated or ISR'd.
export const dynamic = "force-dynamic";

const STREAM_LABELS: Record<string, string> = {
  subscription: "Subscription boxes",
  one_time_box: "One-time boxes",
  a_la_carte_snack: "A la carte snacks",
};

export default async function AdminOperationsDashboard() {
  const [
    salesToday,
    ordersAwaitingFulfillment,
    lowStockSnacks,
    activeSubscriptions,
    customerGrowth,
    repeatPurchaseRate,
    referralMetrics,
    revenueTrends,
  ] = await Promise.all([
    getSalesToday(),
    getOrdersAwaitingFulfillmentCount(),
    getLowStockSnacks(),
    getActiveSubscriptionsCount(),
    getCustomerGrowth(30),
    getRepeatPurchaseRate(),
    getReferralMetrics(),
    getRevenueTrends(30),
  ]);

  const newCustomersLast30Days = customerGrowth.reduce((sum, point) => sum + point.newCustomers, 0);
  const revenueByStream = revenueTrends.reduce<Record<string, number>>((acc, row) => {
    acc[row.stream] = (acc[row.stream] ?? 0) + row.revenueCents;
    return acc;
  }, {});

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Operations Dashboard</h1>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Sales today</p>
          <p className="mt-1 text-2xl font-semibold">{formatPriceCents(salesToday)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Orders awaiting fulfillment</p>
          <p className="mt-1 text-2xl font-semibold">{ordersAwaitingFulfillment}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Active subscriptions</p>
          <p className="mt-1 text-2xl font-semibold">{activeSubscriptions}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Repeat purchase rate</p>
          <p className="mt-1 text-2xl font-semibold">{repeatPurchaseRate.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">New customers (30d)</p>
          <p className="mt-1 text-2xl font-semibold">{newCustomersLast30Days}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Referrals sent / converted</p>
          <p className="mt-1 text-2xl font-semibold">
            {referralMetrics.sent} / {referralMetrics.converted}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Referral reward payout</p>
          <p className="mt-1 text-2xl font-semibold">{referralMetrics.rewardPayoutCents} pts</p>
        </div>
      </div>

      <h2 className="mt-8 font-heading text-lg font-semibold">Revenue by stream (30 days)</h2>
      <div className="mt-2 divide-y rounded-lg border">
        {Object.entries(STREAM_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between p-4 text-sm">
            <span>{label}</span>
            <span className="font-medium">{formatPriceCents(revenueByStream[key] ?? 0)}</span>
          </div>
        ))}
      </div>

      <h2 className="mt-8 font-heading text-lg font-semibold">Low stock (under 10 units)</h2>
      {lowStockSnacks.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing running low right now.</p>
      ) : (
        <div className="mt-2 divide-y rounded-lg border">
          {lowStockSnacks.map((snack) => (
            <div key={snack.snackId} className="flex items-center justify-between p-4 text-sm">
              <span>{snack.name}</span>
              <span className="font-medium text-destructive">{snack.quantityOnHand} left</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
