import { NextRequest, NextResponse } from "next/server";
import { updatePreferencesSchema } from "@/lib/validations/account";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth-user";

/**
 * Milestone 7, Task 4. Whole-form save, not a partial patch (see the
 * schema's header comment) - upserted on user_id (the table's own unique
 * constraint), since a user who has never visited this page yet legitimately
 * has no customer_preferences row (no auto-provisioning trigger, unlike
 * profiles - see queries/account.ts's getPreferences comment).
 */
export async function PATCH(request: NextRequest) {
  const authResult = await getAuthenticatedUser(request);
  if (!authResult.user) {
    return NextResponse.json({ data: null, error: { message: authResult.error } }, { status: authResult.status! });
  }
  const { user } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = updatePreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("customer_preferences")
    .upsert(
      {
        user_id: user.id,
        dietary_restrictions: parsed.data.dietaryRestrictions,
        disliked_categories: parsed.data.dislikedCategories,
        flavor_profile: parsed.data.flavorProfile,
        spice_tolerance: parsed.data.spiceTolerance,
        marketing_opt_in: parsed.data.marketingOptIn,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("dietary_restrictions, disliked_categories, flavor_profile, spice_tolerance, marketing_opt_in")
    .single();

  if (error || !data) {
    return NextResponse.json({ data: null, error: { message: "Could not save preferences" } }, { status: 500 });
  }

  // Milestone 8, Task 8: customer_activity backfill. Awaited as part of this
  // same request (not a fire-and-forget side call, per the plan) so a
  // failure is actually visible in logs - but it does not fail the response,
  // since the preferences save itself already succeeded and is the thing the
  // customer is waiting on.
  const { error: activityError } = await admin
    .from("customer_activity")
    .insert({ user_id: user.id, event_type: "preference_updated" });
  if (activityError) {
    console.error(`Failed to log preference_updated activity for user ${user.id}:`, activityError);
  }

  return NextResponse.json(
    {
      data: {
        dietaryRestrictions: data.dietary_restrictions,
        dislikedCategories: data.disliked_categories,
        flavorProfile: data.flavor_profile,
        spiceTolerance: data.spice_tolerance,
        marketingOptIn: data.marketing_opt_in,
      },
      error: null,
    },
    { status: 200 }
  );
}
