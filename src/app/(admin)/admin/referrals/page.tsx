import { listReferrals } from "@/lib/supabase/queries/admin-referrals";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Read-only - see the query's own header comment: referral creation is
// Milestone 9's job, so this renders zero rows until then. That's expected,
// not a bug to chase.
export default async function AdminReferralsPage() {
  const referrals = await listReferrals();

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Referrals</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Referral creation isn&apos;t wired up yet (Milestone 9) - this list will be empty until then.
      </p>

      <div className="mt-4 divide-y rounded-lg border">
        {referrals.map((referral) => (
          <div key={referral.id} className="flex items-center justify-between p-4 text-sm">
            <div>
              <p className="font-medium">
                {referral.referrerEmail} -&gt; {referral.referredEmail}
              </p>
              <p className="text-muted-foreground">
                {referral.status} - {formatDate(referral.createdAt)}
              </p>
            </div>
          </div>
        ))}
        {referrals.length === 0 && <p className="p-4 text-sm text-muted-foreground">No referrals yet.</p>}
      </div>
    </div>
  );
}
