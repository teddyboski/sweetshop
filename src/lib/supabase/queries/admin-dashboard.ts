import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// Milestone 8, Task 2: Operations Dashboard. Every function here is
// intentionally a plain filtered query against existing tables/views - no
// new SQL views were added for these (unlike revenue_by_stream_daily,
// Task 1), since each is a single-table count/sum/filter that doesn't need
// one. Every number here has a corresponding hand-computed assertion in
// tests/integration/admin-dashboard-metrics.test.ts (roadmap's own
// completion criterion: no metric ships without a verification query
// behind it).

// Product Decision #4: flat low-stock threshold, no per-snack configurable
// value in V1.
const LOW_STOCK_THRESHOLD = 10;

export async function getSalesToday(): Promise<number> {
  const admin = createAdminSupabaseClient();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data, error } = await admin
    .from("orders")
    .select("total_amount_cents")
    .eq("status", "paid")
    .is("deleted_at", null)
    .gte("created_at", todayStart.toISOString());
  if (error) throw error;

  return (data ?? []).reduce((sum, row) => sum + row.total_amount_cents, 0);
}

export async function getOrdersAwaitingFulfillmentCount(): Promise<number> {
  const admin = createAdminSupabaseClient();
  const { count, error } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "paid")
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

export interface LowStockSnack {
  snackId: string;
  name: string;
  quantityOnHand: number;
}

export async function getLowStockSnacks(): Promise<LowStockSnack[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("inventory")
    .select("snack_id, quantity_on_hand, snacks(name)")
    .lt("quantity_on_hand", LOW_STOCK_THRESHOLD)
    .order("quantity_on_hand", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    snackId: row.snack_id,
    name: row.snacks!.name,
    quantityOnHand: row.quantity_on_hand,
  }));
}

export async function getActiveSubscriptionsCount(): Promise<number> {
  const admin = createAdminSupabaseClient();
  const { count, error } = await admin
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  if (error) throw error;
  return count ?? 0;
}

export interface CustomerGrowthPoint {
  date: string;
  newCustomers: number;
}

export async function getCustomerGrowth(days = 30): Promise<CustomerGrowthPoint[]> {
  const admin = createAdminSupabaseClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const { data, error } = await admin.from("profiles").select("created_at").gte("created_at", since.toISOString());
  if (error) throw error;

  const byDate = new Map<string, number>();
  for (const row of data ?? []) {
    const date = row.created_at.slice(0, 10);
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }

  return Array.from(byDate.entries())
    .map(([date, newCustomers]) => ({ date, newCustomers }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Product Decision #5: % of all-time customers with 2+ paid orders, reused
 * directly from customer_lifetime_value rather than a new time-windowed
 * query.
 */
export async function getRepeatPurchaseRate(): Promise<number> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("customer_lifetime_value").select("total_orders");
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return 0;

  const repeatCustomers = rows.filter((r) => (r.total_orders ?? 0) >= 2).length;
  return (repeatCustomers / rows.length) * 100;
}

export interface ReferralMetrics {
  sent: number;
  converted: number;
  rewardPayoutCents: number;
}

/**
 * Referral creation is Milestone 9's job (Ground Truth) - this reads
 * whatever exists today, which will be zero until then. Not a bug.
 */
export async function getReferralMetrics(): Promise<ReferralMetrics> {
  const admin = createAdminSupabaseClient();

  const { count: sent, error: sentError } = await admin
    .from("referrals")
    .select("id", { count: "exact", head: true });
  if (sentError) throw sentError;

  const { count: converted, error: convertedError } = await admin
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("status", "credited");
  if (convertedError) throw convertedError;

  const { data: payoutRows, error: payoutError } = await admin
    .from("rewards_ledger")
    .select("delta_points")
    .in("reason", ["referral_credit", "referral_bonus"]);
  if (payoutError) throw payoutError;

  return {
    sent: sent ?? 0,
    converted: converted ?? 0,
    rewardPayoutCents: (payoutRows ?? []).reduce((sum, row) => sum + row.delta_points, 0),
  };
}

export interface RevenueTrendRow {
  date: string;
  stream: string;
  revenueCents: number;
}

export async function getRevenueTrends(days = 30): Promise<RevenueTrendRow[]> {
  const admin = createAdminSupabaseClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const { data, error } = await admin
    .from("revenue_by_stream_daily")
    .select("revenue_date, revenue_stream, revenue_cents")
    .gte("revenue_date", since.toISOString().slice(0, 10))
    .order("revenue_date", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    date: row.revenue_date!,
    stream: row.revenue_stream!,
    revenueCents: row.revenue_cents ?? 0,
  }));
}
