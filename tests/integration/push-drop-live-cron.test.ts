// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { GET as getDropLiveNotifications } from "@/app/api/cron/drop-live-notifications/route";

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/push/send", () => ({ sendExpoPushNotifications: mockSend }));

const TEST_CRON_SECRET = "test-cron-secret-do-not-use-in-prod";

const admin = createAdminSupabaseClient();

let boxId: string;
let userId: string;
const createdDropIds: string[] = [];

beforeAll(async () => {
  process.env.CRON_SECRET = TEST_CRON_SECRET;

  const { data: box } = await admin.from("boxes").select("id").eq("status", "active").limit(1).single();
  boxId = box!.id;

  const { data: user, error } = await admin.auth.admin.createUser({
    email: `test-drop-live-${crypto.randomUUID()}@mailinator.com`,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error || !user.user) throw error;
  userId = user.user.id;
});

afterAll(async () => {
  await admin.from("push_tokens").delete().eq("user_id", userId);
  for (const id of createdDropIds) await admin.from("drops").delete().eq("id", id);
  await admin.auth.admin.deleteUser(userId);
});

beforeEach(() => {
  mockSend.mockClear();
});

async function seedDrop(overrides: Partial<{ startsAt: Date; endsAt: Date; notifiedAt: string | null }> = {}) {
  const startsAt = overrides.startsAt ?? new Date(Date.now() - 60_000);
  const endsAt = overrides.endsAt ?? new Date(Date.now() + 3600_000);
  const { data, error } = await admin
    .from("drops")
    .insert({
      box_id: boxId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      quantity_limit: 100,
      notified_at: overrides.notifiedAt ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw error;
  createdDropIds.push(data.id);
  return data.id;
}

function request(secret?: string) {
  const headers: Record<string, string> = {};
  if (secret) headers.authorization = `Bearer ${secret}`;
  return new NextRequest("http://localhost:3000/api/cron/drop-live-notifications", { headers });
}

describe("GET /api/cron/drop-live-notifications", () => {
  it("rejects a request with no CRON_SECRET header with 401, before any DB read", async () => {
    const response = await getDropLiveNotifications(request());
    expect(response.status).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret with 401", async () => {
    const response = await getDropLiveNotifications(request("not-the-real-secret"));
    expect(response.status).toBe(401);
  });

  it("notifies a due, not-yet-notified drop and sets notified_at", async () => {
    const token = `ExponentPushToken[test-drop-${crypto.randomUUID()}]`;
    await admin.from("push_tokens").insert({ expo_push_token: token, user_id: userId, platform: "ios" });

    const dropId = await seedDrop();
    const response = await getDropLiveNotifications(request(TEST_CRON_SECRET));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.notified).toBeGreaterThanOrEqual(1);

    expect(mockSend).toHaveBeenCalled();
    const allSentTokens = mockSend.mock.calls.flatMap((call) => call[0].map((m: { to: string }) => m.to));
    expect(allSentTokens).toContain(token);

    const { data: dropAfter } = await admin.from("drops").select("notified_at").eq("id", dropId).single();
    expect(dropAfter!.notified_at).toBeTruthy();

    await admin.from("push_tokens").delete().eq("expo_push_token", token);
  });

  it("does not notify the same drop twice across repeated invocations", async () => {
    const token = `ExponentPushToken[test-drop-repeat-${crypto.randomUUID()}]`;
    await admin.from("push_tokens").insert({ expo_push_token: token, user_id: userId, platform: "ios" });

    const dropId = await seedDrop();
    await getDropLiveNotifications(request(TEST_CRON_SECRET));
    mockSend.mockClear();

    const secondResponse = await getDropLiveNotifications(request(TEST_CRON_SECRET));
    const secondBody = await secondResponse.json();
    expect(secondResponse.status).toBe(200);

    // This specific drop must not appear in a second round of sends - other
    // still-due drops from other tests running in this same suite may
    // legitimately still be pending, so this asserts on this drop's own
    // notified_at rather than asserting mockSend was never called at all.
    const sentDropIdsSecondRound = mockSend.mock.calls.flatMap((call) =>
      call[0].map((m: { data: { dropId: string } }) => m.data.dropId)
    );
    expect(sentDropIdsSecondRound).not.toContain(dropId);
    void secondBody;

    await admin.from("push_tokens").delete().eq("expo_push_token", token);
  });

  it("does not notify a drop whose starts_at is still in the future", async () => {
    const dropId = await seedDrop({ startsAt: new Date(Date.now() + 3600_000) });
    await getDropLiveNotifications(request(TEST_CRON_SECRET));

    const { data: dropAfter } = await admin.from("drops").select("notified_at").eq("id", dropId).single();
    expect(dropAfter!.notified_at).toBeNull();
  });

  it("does not notify a drop that already ended before ever being picked up", async () => {
    const dropId = await seedDrop({
      startsAt: new Date(Date.now() - 7200_000),
      endsAt: new Date(Date.now() - 3600_000),
    });
    await getDropLiveNotifications(request(TEST_CRON_SECRET));

    const { data: dropAfter } = await admin.from("drops").select("notified_at").eq("id", dropId).single();
    expect(dropAfter!.notified_at).toBeNull();
  });
});
