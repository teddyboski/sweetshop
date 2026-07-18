// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSignInWithPassword = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
    },
  }),
}));

beforeEach(() => {
  mockSignInWithPassword.mockReset();
});

describe("POST /api/auth/login", () => {
  it("returns 200 with session tokens on valid credentials", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: "user-123" },
        session: { access_token: "access-abc", refresh_token: "refresh-xyz" },
      },
      error: null,
    });

    const { POST } = await import("@/app/api/auth/login/route");

    const request = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.com", password: "password123" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.userId).toBe("user-123");
    expect(body.data.accessToken).toBe("access-abc");
    expect(body.data.refreshToken).toBe("refresh-xyz");
  });

  it("returns 401 with a generic message on invalid credentials, not the raw supabase error", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const { POST } = await import("@/app/api/auth/login/route");

    const request = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.com", password: "wrongpassword" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Invalid email or password");
  });

  it("rejects an empty password before ever calling supabase", async () => {
    const { POST } = await import("@/app/api/auth/login/route");

    const request = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.com", password: "" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });
});
