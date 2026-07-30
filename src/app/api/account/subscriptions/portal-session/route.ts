import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/client";
import { getAuthenticatedUser } from "@/lib/supabase/auth-user";

/**
 * Milestone 7, Task 2 (Product Decision #2): subscription pause/cancel goes
 * through Stripe's hosted Customer Portal, not an in-app UI. This route only
 * creates the Portal session and hands back its URL - the Portal itself
 * changes Stripe's state, and customer.subscription.updated/.deleted
 * (handled in /api/webhooks/stripe) mirrors that back into our subscriptions
 * table afterward.
 *
 * Auth via bearer token, never a browser cookie session - same
 * mobile-readiness convention every cart/checkout Route Handler in this app
 * already follows (see resolve-cart.ts's header comment).
 */
export async function POST(request: NextRequest) {
  const authResult = await getAuthenticatedUser(request);
  if (!authResult.user) {
    return NextResponse.json({ data: null, error: { message: authResult.error } }, { status: authResult.status! });
  }
  const { user } = authResult;

  const admin = createAdminSupabaseClient();
  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { data: null, error: { message: "No billing account found for this user yet - subscribe to a box first" } },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined);
  if (!appUrl) {
    return NextResponse.json(
      { data: null, error: { message: "Server misconfigured: NEXT_PUBLIC_APP_URL is not set" } },
      { status: 500 }
    );
  }

  const stripe = createStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl}/account/subscriptions`,
  });

  return NextResponse.json({ data: { url: session.url }, error: null }, { status: 201 });
}
