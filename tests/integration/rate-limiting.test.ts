// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// Milestone 10, Task 1. check_rate_limit is a fresh guarded RPC (see that
// migration's own header comment for why a fixed-window Postgres counter
// was chosen over an edge/Redis-based limiter) - exercised directly here
// against a real local Supabase instance, same pattern as
// rewards-referrals-foundations.test.ts's coverage of
// increment_promotion_used_count/redeem_rewards_points. checkRateLimit()'s
// own param-passing and response-shaping is covered separately (mocked) in
// tests/unit/rate-limit-check.test.ts.

const admin = createAdminSupabaseClient();

afterEach(async () => {
  // Every test below uses a fresh crypto.randomUUID() key, so no row from
  // a previous test can ever be reused/collide - cleanup here is just
  // good hygiene, not a correctness requirement of any single test.
  await admin.from("rate_limit_hits").delete().like("key", "test-rl-%");
});

describe("check_rate_limit", () => {
  it("allows requests up to the limit and rejects the one that exceeds it", async () => {
    const key = `test-rl-${crypto.randomUUID()}`;

    for (let i = 0; i < 3; i++) {
      const { data } = await admin.rpc("check_rate_limit", { p_key: key, p_limit: 3, p_window_seconds: 60 });
      expect(data).toBe(true);
    }

    const { data: fourth } = await admin.rpc("check_rate_limit", { p_key: key, p_limit: 3, p_window_seconds: 60 });
    expect(fourth).toBe(false);
  });

  it("tracks independent keys separately - one caller hitting the limit never affects another", async () => {
    const keyA = `test-rl-${crypto.randomUUID()}`;
    const keyB = `test-rl-${crypto.randomUUID()}`;

    for (let i = 0; i < 2; i++) {
      await admin.rpc("check_rate_limit", { p_key: keyA, p_limit: 2, p_window_seconds: 60 });
    }
    const { data: aExceeded } = await admin.rpc("check_rate_limit", { p_key: keyA, p_limit: 2, p_window_seconds: 60 });
    expect(aExceeded).toBe(false);

    const { data: bFirstHit } = await admin.rpc("check_rate_limit", { p_key: keyB, p_limit: 2, p_window_seconds: 60 });
    expect(bFirstHit).toBe(true);
  });

  it("resets once the window elapses", async () => {
    const key = `test-rl-${crypto.randomUUID()}`;

    const { data: first } = await admin.rpc("check_rate_limit", { p_key: key, p_limit: 1, p_window_seconds: 1 });
    expect(first).toBe(true);

    const { data: secondSameWindow } = await admin.rpc("check_rate_limit", { p_key: key, p_limit: 1, p_window_seconds: 1 });
    expect(secondSameWindow).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const { data: afterWindow } = await admin.rpc("check_rate_limit", { p_key: key, p_limit: 1, p_window_seconds: 1 });
    expect(afterWindow).toBe(true);
  });

  it("succeeds repeatedly with no error when called well under the limit", async () => {
    const key = `test-rl-${crypto.randomUUID()}`;
    const { data, error } = await admin.rpc("check_rate_limit", { p_key: key, p_limit: 100, p_window_seconds: 600 });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });
});
