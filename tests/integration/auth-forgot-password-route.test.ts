// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockResetPasswordForEmail = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  }),
}));

beforeEach(() => {
  mockResetPasswordForEmail.mockReset();
});

describe("POST /api/auth/forgot-password", () => {
  it("returns the generic success message for a real account", async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });

    const { POST } = await import("@/app/api/auth/forgot-password/route");

    const request = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "real@b.com" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.message).toBe("If an account exists, a password reset link has been sent.");
  });

  it("returns the identical success message for a non-existent account (no account-existence leak)", async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });

    const { POST } = await import("@/app/api/auth/forgot-password/route");

    const request = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "doesnotexist@b.com" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.message).toBe("If an account exists, a password reset link has been sent.");
  });

  it("rejects an invalid email before calling supabase", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");

    const request = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "nope" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });
});
