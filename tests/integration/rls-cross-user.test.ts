// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/supabase";

// IMPORTANT: never call .auth.signInWithPassword (or any session-mutating
// auth method) on this admin client. Doing so silently swaps its internal
// session away from the service-role key to whichever user just signed in,
// meaning subsequent admin.from() calls would run under that user's RLS
// context instead of bypassing RLS as intended. Use a separate plain client
// (below) for any sign-in needed to obtain a test user's access token.
const admin = createAdminSupabaseClient();

let userAId: string;
let userBId: string;
let userAToken: string;

const emailA = `test-rls-a-${crypto.randomUUID()}@mailinator.com`;
const emailB = `test-rls-b-${crypto.randomUUID()}@mailinator.com`;
const password = crypto.randomUUID();

beforeAll(async () => {
  const { data: userA, error: errorA } = await admin.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true,
  });
  if (errorA || !userA.user) throw errorA;
  userAId = userA.user.id;

  const { data: userB, error: errorB } = await admin.auth.admin.createUser({
    email: emailB,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (errorB || !userB.user) throw errorB;
  userBId = userB.user.id;

  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const { data: session, error: signInError } = await anonAuthClient.auth.signInWithPassword({
    email: emailA,
    password,
  });
  if (signInError || !session.session) throw signInError;
  userAToken = session.session.access_token;
});

afterAll(async () => {
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
});

describe("RLS: cross-user profile access", () => {
  it("authenticated user A cannot read user B's profile row", async () => {
    const userAClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { global: { headers: { Authorization: `Bearer ${userAToken}` } } }
    );

    const { data } = await userAClient.from("profiles").select("*").eq("id", userBId);

    expect(data ?? []).toHaveLength(0);
  });

  it("authenticated user A CAN read their own profile row", async () => {
    const userAClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { global: { headers: { Authorization: `Bearer ${userAToken}` } } }
    );

    const { data } = await userAClient.from("profiles").select("*").eq("id", userAId);

    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(userAId);
  });

  it("authenticated user A cannot update user B's profile role", async () => {
    const userAClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { global: { headers: { Authorization: `Bearer ${userAToken}` } } }
    );

    await userAClient.from("profiles").update({ role: "admin" }).eq("id", userBId);

    const { data: unchanged } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userBId)
      .single();

    expect(unchanged?.role).toBe("customer");
  });
});
