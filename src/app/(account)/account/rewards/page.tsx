import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRewardsBalance, getRewardsLedger } from "@/lib/supabase/queries/account";
import { formatDate } from "@/lib/utils";

// Rewards points can change any time a new order is placed - never
// statically generated or ISR'd.
export const dynamic = "force-dynamic";

export default async function AccountRewardsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [balance, ledger] = await Promise.all([getRewardsBalance(user.id), getRewardsLedger(user.id)]);

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl font-semibold">Rewards</h1>

      <div className="mt-4 rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Current balance</p>
        <p className="text-3xl font-semibold">{balance.toLocaleString()} pts</p>
      </div>

      <h2 className="mt-6 font-heading text-lg font-semibold">History</h2>
      {ledger.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No rewards activity yet.</p>
      ) : (
        <div className="mt-2 divide-y rounded-lg border">
          {ledger.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <p className="font-medium capitalize">{entry.reason.replaceAll("_", " ")}</p>
                <p className="text-muted-foreground">
                  {formatDate(entry.createdAt)}
                  {entry.orderId && (
                    <>
                      {" - "}
                      <Link href={`/account/orders/${entry.orderId}`} className="text-primary underline underline-offset-4">
                        Order #{entry.orderId.slice(0, 8)}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <span className={entry.deltaPoints >= 0 ? "font-medium text-primary" : "font-medium text-destructive"}>
                {entry.deltaPoints >= 0 ? "+" : ""}
                {entry.deltaPoints} pts
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
