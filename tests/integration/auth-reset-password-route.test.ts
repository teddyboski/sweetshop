// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockUpdateUser = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      updateUser: mockUpdateUser,
    },
  }),
}));

// Milestone 10: rate limiting is its own concern with its own dedicated
// test coverage (tests/unit/rate-limit-check.test.ts,
// tests/integration/rate-limiting.test.ts) - mocked out here so this file
// stays focused on reset-password logic, same as every other auth route test.
vi.mock("@/lib/rate-limit/check", () => ({
  checkRateLimit: async () => null,
  RATE_LIMITS: { auth: { scope: "auth", limit: 60, windowSeconds: 600 } },
}));

beforeEach(() => {
  mockUpdateUser.mockReset();
});

describe("POST /api/auth/reset-password", () => {
  it("updates the password with a valid bearer token", async () => {
    mockUpdateUser.mockResolvedValueOnce({ data: {}, error: null });

    const { POST } = await import("@/app/api/auth/reset-password/route");

    const request = new NextRequest("http://localhost:3000/api/auth/reset-password", {
      method: "POST",
      headers: { Authorization: "Bearer fake-recovery-token" },
      body: JSON.stringify({ password: "newpassword123" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.message).toBe("Password updated successfully.");
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "newpassword123" });
  });

  it("rejects requests with no bearer token", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");

    const request = new NextRequest("http://localhost:3000/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ password: "newpassword123" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects a short password", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");

    const request = new NextRequest("http://localhost:3000/api/auth/reset-password", {
      method: "POST",
      headers: { Authorization: "Bearer fake-recovery-token" },
      body: JSON.stringify({ password: "short" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
