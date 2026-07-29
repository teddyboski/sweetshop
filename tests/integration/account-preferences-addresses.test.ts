// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { PATCH as patchPreferences } from "@/app/api/account/preferences/route";
import { POST as postAddress } from "@/app/api/account/addresses/route";
import { PATCH as patchAddress, DELETE as deleteAddress } from "@/app/api/account/addresses/[id]/route";
import { getPreferences, getAddresses } from "@/lib/supabase/queries/account";

// See rls-cross-user.test.ts's header comment: never call a session-mutating
// auth method on the admin client itself - use a separate plain client to
// sign in and obtain a bearer token instead.
const admin = createAdminSupabaseClient();

let userAId: string;
let userAToken: string;
let userBId: string;
let userBToken: string;

const createdAddressIds: string[] = [];

async function createTestUser(prefix: string) {
  const email = `test-${prefix}-${crypto.randomUUID()}@mailinator.com`;
  const password = crypto.randomUUID();

  const { data: user, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !user.user) throw error;

  const anonAuthClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const { data: session, error: signInError } = await anonAuthClient.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw signInError;

  return { id: user.user.id, token: session.session.access_token };
}

beforeAll(async () => {
  const userA = await createTestUser("prefs-a");
  userAId = userA.id;
  userAToken = userA.token;

  const userB = await createTestUser("prefs-b");
  userBId = userB.id;
  userBToken = userB.token;
});

afterAll(async () => {
  // customer_addresses/customer_preferences cascade from profiles on delete
  // (see the migration's "on delete cascade"), so no manual row cleanup is
  // needed before deleting the users themselves.
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
});

function patchPreferencesRequest(body: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost:3000/api/account/preferences", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

function postAddressRequest(body: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest("http://localhost:3000/api/account/addresses", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function patchAddressRequest(id: string, body: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost:3000/api/account/addresses/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

function deleteAddressRequest(id: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost:3000/api/account/addresses/${id}`, { method: "DELETE", headers });
}

const sampleAddress = {
  recipientName: "Test Recipient",
  line1: "1 Test St",
  city: "Testville",
  state: "CA",
  postalCode: "90210",
  country: "US",
};

describe("PATCH /api/account/preferences", () => {
  it("saves and round-trips every field", async () => {
    const response = await patchPreferences(
      patchPreferencesRequest(
        {
          dietaryRestrictions: ["nut-free"],
          dislikedCategories: ["licorice"],
          flavorProfile: ["sweet", "salty"],
          spiceTolerance: "mild",
          marketingOptIn: false,
        },
        userAToken
      )
    );
    expect(response.status).toBe(200);

    const preferences = await getPreferences(userAId);
    expect(preferences).toEqual({
      dietaryRestrictions: ["nut-free"],
      dislikedCategories: ["licorice"],
      flavorProfile: ["sweet", "salty"],
      spiceTolerance: "mild",
      marketingOptIn: false,
    });
  });

  it("rejects requests with no bearer token", async () => {
    const response = await patchPreferences(patchPreferencesRequest({ marketingOptIn: true }));
    expect(response.status).toBe(401);
  });
});

describe("POST /api/account/addresses and PATCH default-swap", () => {
  it("setting a new address as default un-defaults the previous one", async () => {
    const firstResponse = await postAddress(postAddressRequest({ ...sampleAddress, isDefault: true }, userAToken));
    const firstBody = await firstResponse.json();
    expect(firstResponse.status).toBe(201);
    expect(firstBody.data.isDefault).toBe(true);
    createdAddressIds.push(firstBody.data.id);

    const secondResponse = await postAddress(
      postAddressRequest({ ...sampleAddress, recipientName: "Second Recipient", isDefault: true }, userAToken)
    );
    const secondBody = await secondResponse.json();
    expect(secondResponse.status).toBe(201);
    expect(secondBody.data.isDefault).toBe(true);
    createdAddressIds.push(secondBody.data.id);

    const addresses = await getAddresses(userAId);
    const first = addresses.find((a) => a.id === firstBody.data.id);
    const second = addresses.find((a) => a.id === secondBody.data.id);
    expect(first?.isDefault).toBe(false);
    expect(second?.isDefault).toBe(true);
  });

  it("PATCH isDefault:true also un-defaults the previous default", async () => {
    const first = await postAddress(postAddressRequest({ ...sampleAddress, isDefault: true }, userAToken));
    const firstBody = await first.json();
    createdAddressIds.push(firstBody.data.id);

    const second = await postAddress(postAddressRequest({ ...sampleAddress, isDefault: false }, userAToken));
    const secondBody = await second.json();
    createdAddressIds.push(secondBody.data.id);

    const patchResponse = await patchAddress(
      patchAddressRequest(secondBody.data.id, { isDefault: true }, userAToken),
      { params: Promise.resolve({ id: secondBody.data.id }) }
    );
    expect(patchResponse.status).toBe(200);

    const addresses = await getAddresses(userAId);
    expect(addresses.find((a) => a.id === firstBody.data.id)?.isDefault).toBe(false);
    expect(addresses.find((a) => a.id === secondBody.data.id)?.isDefault).toBe(true);
  });

  it("returns 404 (not 403) when PATCHing another user's address", async () => {
    const created = await postAddress(postAddressRequest(sampleAddress, userAToken));
    const createdBody = await created.json();
    createdAddressIds.push(createdBody.data.id);

    const response = await patchAddress(patchAddressRequest(createdBody.data.id, { city: "Nowhere" }, userBToken), {
      params: Promise.resolve({ id: createdBody.data.id }),
    });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/account/addresses/[id]", () => {
  it("soft-deletes: sets deleted_at and excludes it from the active list without hard-deleting the row", async () => {
    const created = await postAddress(postAddressRequest(sampleAddress, userAToken));
    const createdBody = await created.json();
    createdAddressIds.push(createdBody.data.id);

    const deleteResponse = await deleteAddress(deleteAddressRequest(createdBody.data.id, userAToken), {
      params: Promise.resolve({ id: createdBody.data.id }),
    });
    expect(deleteResponse.status).toBe(200);

    const activeAddresses = await getAddresses(userAId);
    expect(activeAddresses.find((a) => a.id === createdBody.data.id)).toBeUndefined();

    const { data: rawRow } = await admin
      .from("customer_addresses")
      .select("id, deleted_at")
      .eq("id", createdBody.data.id)
      .maybeSingle();
    expect(rawRow).not.toBeNull();
    expect(rawRow!.deleted_at).not.toBeNull();
  });

  it("returns 404 (not 403) when deleting another user's address", async () => {
    const created = await postAddress(postAddressRequest(sampleAddress, userAToken));
    const createdBody = await created.json();
    createdAddressIds.push(createdBody.data.id);

    const response = await deleteAddress(deleteAddressRequest(createdBody.data.id, userBToken), {
      params: Promise.resolve({ id: createdBody.data.id }),
    });
    expect(response.status).toBe(404);
  });
});
