// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSignUp = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signUp: mockSignUp,
    },
  }),
}));

beforeEach(() => {
  mockSignUp.mockReset();
});

describe("POST /api/auth/signup", () => {
  it("calls supabase signUp with the validated email and password, returns 201 with the new user id", async () => {
    mockSignUp.mockResolvedValueOnce({
      data: { user: { id: "fake-user-id-123" } },
      error: null,
    });

    const { POST } = await import("@/app/api/auth/signup/route");

    const request = new NextRequest("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.com", password: "password123" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(mockSignUp).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "password123",
    });
    expect(response.status).toBe(201);
    expect(body.data.userId).toBe("fake-user-id-123");
  });

  it("rejects an invalid email before ever calling supabase", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");

    const request = new NextRequest("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email", password: "password123" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("rejects a short password before ever calling supabase", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");

    const request = new NextRequest("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.com", password: "short" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns 400 when supabase signUp itself returns an error", async () => {
    mockSignUp.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "email rate limit exceeded" },
    });

    const { POST } = await import("@/app/api/auth/signup/route");

    const request = new NextRequest("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.com", password: "password123" }),
    });
    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("email rate limit exceeded");
  });
});
