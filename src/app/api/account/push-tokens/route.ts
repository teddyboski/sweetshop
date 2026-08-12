import { NextRequest, NextResponse } from "next/server";
import { registerPushTokenSchema } from "@/lib/validations/account";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth-user";

/**
 * Milestone 14 (mobile), Task 7. Upserts on expo_push_token (the table's
 * primary key, not user_id) - see push_tokens' migration comment and the
 * plan doc's Product Decision #5: if a different account signs into the
 * same physical device, this correctly reassigns the row's user_id rather
 * than creating a stale duplicate that would keep notifying the previous
 * account on a device they're no longer signed into.
 */
export async function POST(request: NextRequest) {
  const authResult = await getAuthenticatedUser(request);
  if (!authResult.user) {
    return NextResponse.json({ data: null, error: { message: authResult.error } }, { status: authResult.status! });
  }

  const body = await request.json().catch(() => null);
  const parsed = registerPushTokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("push_tokens").upsert(
    {
      expo_push_token: parsed.data.expoPushToken,
      user_id: authResult.user.id,
      platform: parsed.data.platform,
    },
    { onConflict: "expo_push_token" }
  );

  if (error) {
    return NextResponse.json({ data: null, error: { message: "Could not register push token" } }, { status: 500 });
  }

  return NextResponse.json({ data: { registered: true }, error: null }, { status: 200 });
}

/**
 * Called on sign-out (Product Decision #5) - deregisters this device's
 * token so a signed-out device stops receiving another account's pushes
 * purely because no one happened to sign into it again. Deletes by token
 * value, scoped to the caller's own user_id (a caller can only ever remove
 * their own registration, defense-in-depth even though the token itself
 * came from that same device's own SecureStore).
 */
export async function DELETE(request: NextRequest) {
  const authResult = await getAuthenticatedUser(request);
  if (!authResult.user) {
    return NextResponse.json({ data: null, error: { message: authResult.error } }, { status: authResult.status! });
  }

  const body = await request.json().catch(() => null);
  const parsed = registerPushTokenSchema.pick({ expoPushToken: true }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: { message: parsed.error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();
  await admin
    .from("push_tokens")
    .delete()
    .eq("expo_push_token", parsed.data.expoPushToken)
    .eq("user_id", authResult.user.id);

  return NextResponse.json({ data: { deregistered: true }, error: null }, { status: 200 });
}
