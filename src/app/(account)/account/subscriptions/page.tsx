import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSubscriptionsForUser } from "@/lib/supabase/queries/account";
import { ManageSubscriptionButton } from "@/components/features/account/manage-subscription-button";
import { formatDate } from "@/lib/utils";

// Subscription status can change any time via the Stripe Customer Portal -
// never statically generated or ISR'd.
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
  past_due: "Past due",
};

export default async function AccountSubscriptionsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // proxy.ts already guarantees an authenticated session for every /account/*
  // route - this is a defense-in-depth backstop, matching how admin routes
  // re-check role rather than trusting the middleware alone.
  if (!user) redirect("/login");

  const subscriptions = await getSubscriptionsForUser(user.id);

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl font-semibold">Subscriptions</h1>

      {subscriptions.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          You don&apos;t have any subscription boxes yet.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {subscriptions.map((subscription) => (
            <div key={subscription.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{subscription.boxTitle}</p>
                  <p className="text-sm text-muted-foreground">
                    {STATUS_LABELS[subscription.status] ?? subscription.status}
                    {subscription.cadence ? ` - billed ${subscription.cadence}` : ""}
                  </p>
                  {subscription.nextDeliveryAt && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Next delivery: {formatDate(subscription.nextDeliveryAt)}
                    </p>
                  )}
                </div>
                <ManageSubscriptionButton />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
