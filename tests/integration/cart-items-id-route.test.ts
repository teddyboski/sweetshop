// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { POST } from "@/app/api/cart/items/route";
import { PATCH, DELETE } from "@/app/api/cart/items/[id]/route";

const admin = createAdminSupabaseClient();

let byoSnackIds: string[];
const createdCartIds: string[] = [];

beforeAll(async () => {
  const { data: byoSnacks } = await admin.from("snacks").select("id").eq("is_byo_eligible", true).limit(8);
  byoSnackIds = byoSnacks!.map((s) => s.id);
});

afterEach(async () => {
  for (const cartId of createdCartIds) {
    await admin.from("carts").delete().eq("id", cartId);
  }
  createdCartIds.length = 0;
});

function postRequest(body: unknown, cookieValue?: string) {
  const request = new NextRequest("http://localhost:3000/api/cart/items", {
    method: "POST",
    headers: cookieValue ? { cookie: `anonymous_cart_id=${cookieValue}` } : {},
    body: JSON.stringify(body),
  });
  return POST(request);
}

function patchRequest(id: string, body: unknown, cookieValue?: string) {
  const request = new NextRequest(`http://localhost:3000/api/cart/items/${id}`, {
    method: "PATCH",
    headers: cookieValue ? { cookie: `anonymous_cart_id=${cookieValue}` } : {},
    body: JSON.stringify(body),
  });
  return PATCH(request, { params: Promise.resolve({ id }) });
}

function deleteRequest(id: string, cookieValue?: string) {
  const request = new NextRequest(`http://localhost:3000/api/cart/items/${id}`, {
    method: "DELETE",
    headers: cookieValue ? { cookie: `anonymous_cart_id=${cookieValue}` } : {},
  });
  return DELETE(request, { params: Promise.resolve({ id }) });
}

/** Adds a curated box to a fresh (or existing) anonymous cart and returns the cart_item id + cookie. */
async function addBoxItem(cookieValue?: string) {
  const response = await postRequest({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }, cookieValue);
  const body = await response.json();
  const setCookie = response.headers.get("set-cookie");
  const resolvedCookie = cookieValue ?? setCookie!.match(/anonymous_cart_id=([^;]+)/)![1];

  const { data: cartItem } = await admin
    .from("cart_items")
    .select("id, cart_id")
    .eq("id", body.data.cartItemId)
    .single();
  createdCartIds.push(cartItem!.cart_id);

  return { itemId: cartItem!.id as string, cookieValue: resolvedCookie };
}

/** Adds a build-a-box selection to a fresh (or existing) anonymous cart. */
async function addBuildABoxItem(cookieValue?: string) {
  const response = await postRequest(
    {
      itemType: "build_a_box",
      boxSlug: "build-a-box-small",
      snacks: byoSnackIds.map((snackId) => ({ snackId, quantity: 1 })),
    },
    cookieValue
  );
  const body = await response.json();
  const setCookie = response.headers.get("set-cookie");
  const resolvedCookie = cookieValue ?? setCookie!.match(/anonymous_cart_id=([^;]+)/)![1];

  const { data: cartItem } = await admin
    .from("cart_items")
    .select("id, cart_id")
    .eq("id", body.data.cartItemId)
    .single();
  createdCartIds.push(cartItem!.cart_id);

  return { itemId: cartItem!.id as string, cookieValue: resolvedCookie };
}

describe("PATCH /api/cart/items/[id]", () => {
  it("updates the quantity of a box line", async () => {
    const { itemId, cookieValue } = await addBoxItem();

    const response = await patchRequest(itemId, { quantity: 5 }, cookieValue);
    expect(response.status).toBe(200);

    const { data: updated } = await admin.from("cart_items").select("quantity").eq("id", itemId).single();
    expect(updated!.quantity).toBe(5);
  });

  it("rejects a quantity change on a build_a_box line with 400", async () => {
    const { itemId, cookieValue } = await addBuildABoxItem();

    const response = await patchRequest(itemId, { quantity: 2 }, cookieValue);
    expect(response.status).toBe(400);

    const { data: unchanged } = await admin.from("cart_items").select("quantity").eq("id", itemId).single();
    expect(unchanged!.quantity).toBe(1);
  });

  it("rejects a quantity below 1 with 400", async () => {
    const { itemId, cookieValue } = await addBoxItem();

    const response = await patchRequest(itemId, { quantity: 0 }, cookieValue);
    expect(response.status).toBe(400);
  });

  it("returns 404 (not 403) when the item belongs to a different cart", async () => {
    const { itemId } = await addBoxItem();
    const { cookieValue: otherCookie } = await addBoxItem();

    const response = await patchRequest(itemId, { quantity: 3 }, otherCookie);
    expect(response.status).toBe(404);
  });

  it("returns 404 when there is no cart cookie at all", async () => {
    const { itemId } = await addBoxItem();

    const response = await patchRequest(itemId, { quantity: 3 });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/cart/items/[id]", () => {
  it("removes the cart_items row and cascades cart_item_snacks for a build_a_box line", async () => {
    const { itemId, cookieValue } = await addBuildABoxItem();

    const response = await deleteRequest(itemId, cookieValue);
    expect(response.status).toBe(200);

    const { data: item } = await admin.from("cart_items").select("id").eq("id", itemId).maybeSingle();
    expect(item).toBeNull();

    const { data: snackRows } = await admin.from("cart_item_snacks").select("id").eq("cart_item_id", itemId);
    expect(snackRows).toHaveLength(0);
  });

  it("returns 404 (not 403) when the item belongs to a different cart", async () => {
    const { itemId } = await addBoxItem();
    const { cookieValue: otherCookie } = await addBoxItem();

    const response = await deleteRequest(itemId, otherCookie);
    expect(response.status).toBe(404);

    const { data: stillThere } = await admin.from("cart_items").select("id").eq("id", itemId).maybeSingle();
    expect(stillThere).not.toBeNull();
  });
});
