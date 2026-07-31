import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";
import { RewardsAdjustForm } from "@/components/features/admin/rewards-adjust-form";

export const dynamic = "force-dynamic";

interface AdminRewardsPageProps {
  searchParams: Promise<{ userId?: string }>;
}

export default async function AdminRewardsPage({ searchParams }: AdminRewardsPageProps) {
  const { userId } = await searchParams;
  const admin = createAdminSupabaseClient();

  let query = admin
    .from("rewards_ledger")
    .select("id, user_id, delta_points, reason, order_id, created_at, profiles(email)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (userId) query = query.eq("user_id", userId);

  const { data: ledger } = await query;

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Rewards</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div>
          <form className="flex gap-2" action="/admin/rewards">
            <input
              type="text"
              name="userId"
              defaultValue={userId ?? ""}
              placeholder="Filter by user ID"
              className="w-64 rounded-md border p-2 text-sm"
            />
            <button type="submit" className="rounded-md border px-3 py-2 text-sm">
              Filter
            </button>
          </form>

          <div className="mt-4 divide-y rounded-lg border">
            {(ledger ?? []).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-medium">{entry.profiles?.email ?? entry.user_id}</p>
                  <p className="text-muted-foreground">
                    {entry.reason} - {formatDate(entry.created_at)}
                  </p>
                </div>
                <span className={entry.delta_points >= 0 ? "font-medium text-primary" : "font-medium text-destructive"}>
                  {entry.delta_points >= 0 ? "+" : ""}
                  {entry.delta_points}
                </span>
              </div>
            ))}
            {(ledger ?? []).length === 0 && <p className="p-3 text-sm text-muted-foreground">No ledger entries found.</p>}
          </div>
        </div>

        <div>
          <h2 className="font-heading text-lg font-semibold">Manual adjustment</h2>
          <div className="mt-2 rounded-lg border p-4">
            <RewardsAdjustForm />
          </div>
        </div>
      </div>
    </div>
  );
}
