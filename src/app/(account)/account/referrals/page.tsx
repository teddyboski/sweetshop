import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getReferralCode, getReferralsForUser } from "@/lib/supabase/queries/account";
import { CopyReferralLink } from "@/components/features/account/copy-referral-link";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  credited: "Credited",
};

export default async function AccountReferralsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [referralCode, referrals] = await Promise.all([getReferralCode(user.id), getReferralsForUser(user.id)]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const referralLink = `${appUrl}/signup?ref=${referralCode}`;

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl font-semibold">Referrals</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Share your link - when a friend signs up and makes their first purchase, you both get rewarded.
      </p>

      <div className="mt-4">
        <CopyReferralLink link={referralLink} />
      </div>

      <h2 className="mt-6 font-heading text-lg font-semibold">Friends you&apos;ve referred</h2>
      {referrals.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No referrals yet - share your link above to get started.
        </p>
      ) : (
        <div className="mt-2 divide-y rounded-lg border">
          {referrals.map((referral) => (
            <div key={referral.id} className="flex items-center justify-between p-4 text-sm">
              <span className="text-muted-foreground">{formatDate(referral.createdAt)}</span>
              <span className="font-medium">{STATUS_LABELS[referral.status] ?? referral.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
