// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { POST as postPushToken, DELETE as deletePushToken } from "@/app/api/account/push-tokens/route";

const admin = createAdminSupabaseClient();

let userAId: string;
let userAToken: string;
let userBId: string;
let userBToken: string;

const emailA = `test-push-token-a-${crypto.randomUUID()}@mailinator.com`;
const emailB = `test-push-token-b-${crypto.randomUUID()}@mailinator.com`;

async function signIn(email: string, password: string): Promise<string> {
  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const { data, error } = await anonAuthClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error;
  return data.session.access_token;
}

beforeAll(async () => {
  const passwordA = crypto.randomUUID();
  const { data: userA, error: errorA } = await admin.auth.admin.createUser({
    email: emailA,
    password: passwordA,
    email_confirm: true,
  });
  if (errorA || !userA.user) throw errorA;
  userAId = userA.user.id;
  userAToken = await signIn(emailA, passwordA);

  const passwordB = crypto.randomUUID();
  const { data: userB, error: errorB } = await admin.auth.admin.createUser({
    email: emailB,
    password: passwordB,
    email_confirm: true,
  });
  if (errorB || !userB.user) throw errorB;
  userBId = userB.user.id;
  userBToken = await signIn(emailB, passwordB);
});

afterAll(async () => {
  await admin.from("push_tokens").delete().in("user_id", [userAId, userBId]);
  await admin.auth.admin.deleteUser(userAId);
  await admin.auth.admin.deleteUser(userBId);
});

function request(method: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost:3000/api/account/push-tokens", { method, headers, body: JSON.stringify(body) });
}

describe("POST /api/account/push-tokens", () => {
  it("registers a new token for the authenticated user", async () => {
    const token = `ExponentPushToken[test-${crypto.randomUUID()}]`;
    const response = await postPushToken(request("POST", { expoPushToken: token, platform: "ios" }, userAToken));
    expect(response.status).toBe(200);

    const { data } = await admin.from("push_tokens").select("user_id, platform").eq("expo_push_token", token).single();
    expect(data!.user_id).toBe(userAId);
    expect(data!.platform).toBe("ios");
  });

  it("reassigns an existing token's user_id when a different account registers the same device token (Product Decision #5)", async () => {
    const token = `ExponentPushToken[test-shared-${crypto.randomUUID()}]`;
    await postPushToken(request("POST", { expoPushToken: token, platform: "android" }, userAToken));

    const response = await postPushToken(request("POST", { expoPushToken: token, platform: "android" }, userBToken));
    expect(response.status).toBe(200);

    const { data: rows } = await admin.from("push_tokens").select("user_id").eq("expo_push_token", token);
    expect(rows).toHaveLength(1); // no duplicate row - reassigned, not accumulated
    expect(rows![0]!.user_id).toBe(userBId);
  });

  it("rejects an invalid platform value with 400", async () => {
    const response = await postPushToken(
      request("POST", { expoPushToken: "ExponentPushToken[x]", platform: "windows" }, userAToken)
    );
    expect(response.status).toBe(400);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await postPushToken(request("POST", { expoPushToken: "ExponentPushToken[x]", platform: "ios" }));
    expect(response.status).toBe(401);
  });
});

describe("DELETE /api/account/push-tokens", () => {
  it("removes the caller's own token", async () => {
    const token = `ExponentPushToken[test-delete-${crypto.randomUUID()}]`;
    await postPushToken(request("POST", { expoPushToken: token, platform: "ios" }, userAToken));

    const response = await deletePushToken(request("DELETE", { expoPushToken: token, platform: "ios" }, userAToken));
    expect(response.status).toBe(200);

    const { data } = await admin.from("push_tokens").select("expo_push_token").eq("expo_push_token", token).maybeSingle();
    expect(data).toBeNull();
  });

  it("does not remove a token belonging to a different user, even if the exact token string is guessed", async () => {
    const token = `ExponentPushToken[test-other-owner-${crypto.randomUUID()}]`;
    await postPushToken(request("POST", { expoPushToken: token, platform: "ios" }, userAToken));

    await deletePushToken(request("DELETE", { expoPushToken: token, platform: "ios" }, userBToken));

    const { data } = await admin.from("push_tokens").select("user_id").eq("expo_push_token", token).maybeSingle();
    expect(data).toBeTruthy(); // still there - userB's DELETE was scoped to userB's own user_id, matched nothing
    expect(data!.user_id).toBe(userAId);
  });
});
