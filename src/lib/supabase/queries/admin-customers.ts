import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export interface CustomerListRow {
  id: string;
  email: string;
  role: string;
  rewardsPoints: number;
  createdAt: string;
  totalOrders: number;
  totalSpendCents: number;
}

const PAGE_SIZE = 25;

/**
 * Paginated, optionally email-filtered customer list. Joins the
 * customer_lifetime_value view (Task 2's revenue foundation) rather than
 * aggregating orders here directly - same reuse rationale as the Operations
 * Dashboard queries.
 */
export async function listCustomers(opts: { search?: string; page?: number } = {}): Promise<{
  customers: CustomerListRow[];
  total: number;
}> {
  const admin = createAdminSupabaseClient();
  const page = opts.page && opts.page > 0 ? opts.page : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = admin
    .from("profiles")
    .select("id, email, role, rewards_points, created_at", { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (opts.search) {
    query = query.ilike("email", `%${opts.search}%`);
  }

  const { data: profiles, error, count } = await query;
  if (error) throw error;

  const userIds = (profiles ?? []).map((p) => p.id);
  const { data: ltv } = await admin
    .from("customer_lifetime_value")
    .select("user_id, total_orders, total_spend_cents")
    .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const ltvByUser = new Map((ltv ?? []).map((row) => [row.user_id, row]));

  const customers: CustomerListRow[] = (profiles ?? []).map((profile) => {
    const stats = ltvByUser.get(profile.id);
    return {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      rewardsPoints: profile.rewards_points,
      createdAt: profile.created_at,
      totalOrders: stats?.total_orders ?? 0,
      totalSpendCents: stats?.total_spend_cents ?? 0,
    };
  });

  return { customers, total: count ?? 0 };
}

export interface CustomerDetail {
  id: string;
  email: string;
  role: string;
  rewardsPoints: number;
  createdAt: string;
  lifetimeValue: {
    totalOrders: number;
    totalSpendCents: number;
    avgOrderValueCents: number;
    firstOrderAt: string | null;
    lastOrderAt: string | null;
  };
  preferences: {
    dietaryRestrictions: string[];
    dislikedCategories: string[];
    flavorProfile: string[];
    spiceTolerance: string | null;
    marketingOptIn: boolean;
  } | null;
  recentActivity: Array<{ id: string; eventType: string; metadata: unknown; createdAt: string }>;
  recentOrders: Array<{ id: string; status: string; totalAmountCents: number; createdAt: string }>;
}

export async function getCustomerDetail(userId: string): Promise<CustomerDetail | null> {
  const admin = createAdminSupabaseClient();

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, email, role, rewards_points, created_at")
    .eq("id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return null;

  const { data: ltv } = await admin
    .from("customer_lifetime_value")
    .select("total_orders, total_spend_cents, avg_order_value_cents, first_order_at, last_order_at")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: prefs } = await admin
    .from("customer_preferences")
    .select("dietary_restrictions, disliked_categories, flavor_profile, spice_tolerance, marketing_opt_in")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: activity } = await admin
    .from("customer_activity")
    .select("id, event_type, metadata, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: orders } = await admin
    .from("orders")
    .select("id, status, total_amount_cents, created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(25);

  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    rewardsPoints: profile.rewards_points,
    createdAt: profile.created_at,
    lifetimeValue: {
      totalOrders: ltv?.total_orders ?? 0,
      totalSpendCents: ltv?.total_spend_cents ?? 0,
      avgOrderValueCents: ltv?.avg_order_value_cents ?? 0,
      firstOrderAt: ltv?.first_order_at ?? null,
      lastOrderAt: ltv?.last_order_at ?? null,
    },
    preferences: prefs
      ? {
          dietaryRestrictions: prefs.dietary_restrictions,
          dislikedCategories: prefs.disliked_categories,
          flavorProfile: prefs.flavor_profile,
          spiceTolerance: prefs.spice_tolerance,
          marketingOptIn: prefs.marketing_opt_in,
        }
      : null,
    recentActivity: (activity ?? []).map((a) => ({
      id: a.id,
      eventType: a.event_type,
      metadata: a.metadata,
      createdAt: a.created_at,
    })),
    recentOrders: (orders ?? []).map((o) => ({
      id: o.id,
      status: o.status,
      totalAmountCents: o.total_amount_cents,
      createdAt: o.created_at,
    })),
  };
}
