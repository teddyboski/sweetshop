// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Milestone 10, Task 1. Unit-level coverage for the checkRateLimit() helper
// itself (IP resolution, the fail-open-on-db-error behavior, and the 429
// response shape) with a mocked admin client - the real check_rate_limit
// RPC's own window/counter semantics are covered against a real local
// Supabase instance in tests/integration/rate-limiting.test.ts instead,
// same split as every other guarded-RPC feature in this codebase.
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ rpc: mockRpc }),
}));

beforeEach(() => {
  mockRpc.mockReset();
});

function requestWithIp(ip?: string) {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: ip ? { "x-forwarded-for": ip } : undefined,
  });
}

describe("checkRateLimit", () => {
  it("returns null (allow) when the RPC reports the caller is within the limit", async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    const { checkRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit/check");

    const result = await checkRateLimit(requestWithIp("203.0.113.7"), RATE_LIMITS.auth);
    expect(result).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith("check_rate_limit", {
      p_key: "auth:203.0.113.7",
      p_limit: 60,
      p_window_seconds: 600,
    });
  });

  it("returns a 429 with a Retry-After header when the RPC reports the limit is exceeded", async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });
    const { checkRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit/check");

    const result = await checkRateLimit(requestWithIp("203.0.113.7"), RATE_LIMITS.checkout);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    expect(result!.headers.get("Retry-After")).toBe("60");

    const body = await result!.json();
    expect(body.error.message).toBeTruthy();
  });

  it("uses only the first address from a comma-separated x-forwarded-for chain", async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    const { checkRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit/check");

    await checkRateLimit(requestWithIp("203.0.113.7, 10.0.0.1, 10.0.0.2"), RATE_LIMITS.auth);
    expect(mockRpc).toHaveBeenCalledWith("check_rate_limit", expect.objectContaining({ p_key: "auth:203.0.113.7" }));
  });

  it("scopes the key by config.scope so different route groups never share a bucket", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const { checkRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit/check");

    await checkRateLimit(requestWithIp("203.0.113.7"), RATE_LIMITS.auth);
    await checkRateLimit(requestWithIp("203.0.113.7"), RATE_LIMITS.checkout);

    expect(mockRpc).toHaveBeenNthCalledWith(1, "check_rate_limit", expect.objectContaining({ p_key: "auth:203.0.113.7" }));
    expect(mockRpc).toHaveBeenNthCalledWith(2, "check_rate_limit", expect.objectContaining({ p_key: "checkout:203.0.113.7" }));
  });

  it("fails open (returns null) if the RPC call itself errors, rather than blocking every public endpoint", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "connection reset" } });
    const { checkRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit/check");

    const result = await checkRateLimit(requestWithIp("203.0.113.7"), RATE_LIMITS.auth);
    expect(result).toBeNull();
  });

  it("falls back to a constant key when there's no x-forwarded-for header (local dev, no proxy in front)", async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    const { checkRateLimit, RATE_LIMITS } = await import("@/lib/rate-limit/check");

    await checkRateLimit(requestWithIp(undefined), RATE_LIMITS.auth);
    expect(mockRpc).toHaveBeenCalledWith("check_rate_limit", expect.objectContaining({ p_key: "auth:local-dev" }));
  });
});
