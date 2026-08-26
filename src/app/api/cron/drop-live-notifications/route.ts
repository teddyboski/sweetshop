import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sendExpoPushNotifications } from "@/lib/push/send";

/**
 * Milestone 14 (mobile), Task 9. Polled every minute by Vercel Cron
 * (vercel.json, plan doc Product Decision #1) - no scheduling
 * infrastructure existed anywhere in this repo before this route.
 *
 * Auth: Vercel signs its own cron requests with an Authorization: Bearer
 * header matching the CRON_SECRET env var - the standard Vercel Cron auth
 * pattern, checked here the same way any other bearer-token route would,
 * just against a fixed secret instead of a Supabase session.
 *
 * Selects drops where starts_at has passed, ends_at hasn't (skips a drop
 * that already ended before ever being picked up - e.g. after a deploy or
 * downtime window, no point notifying about something no longer buyable),
 * and notified_at is still null (the guard against notifying the same drop
 * twice across repeated 1-minute polls). A Drop-live alert is broadcast to
 * every registered device, not scoped to one user - unlike the
 * order-shipped trigger, there's no natural "who should get this" filter.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ data: null, error: { message: "Unauthorized" } }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const nowIso = new Date().toISOString();

  const { data: dueDrops, error } = await admin
    .from("drops")
    .select("id, starts_at, ends_at, boxes(title)")
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso)
    .is("notified_at", null);

  if (error) {
    return NextResponse.json({ data: null, error: { message: "Could not load due drops" } }, { status: 500 });
  }

  if (!dueDrops || dueDrops.length === 0) {
    return NextResponse.json({ data: { notified: 0 }, error: null }, { status: 200 });
  }

  const { data: tokens } = await admin.from("push_tokens").select("expo_push_token");

  for (const drop of dueDrops) {
    if (tokens && tokens.length > 0) {
      await sendExpoPushNotifications(
        tokens.map((t) => ({
          to: t.expo_push_token,
          title: "A Drop just went live!",
          body: `${drop.boxes?.title ?? "A limited-time box"} is available now - while supplies last.`,
          data: { type: "drop_live", dropId: drop.id },
        }))
      );
    }

    // Set per-drop immediately after that drop's sends, not batched at the
    // end - if this route were interrupted partway through a large due-drop
    // list, already-notified drops must not be notified again on the next
    // minute's poll.
    await admin.from("drops").update({ notified_at: nowIso }).eq("id", drop.id);
  }

  return NextResponse.json({ data: { notified: dueDrops.length }, error: null }, { status: 200 });
}
