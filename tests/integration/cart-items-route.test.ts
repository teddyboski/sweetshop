// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { POST } from "@/app/api/cart/items/route";

const admin = createAdminSupabaseClient();

let byoSnackIds: string[];
let nonByoSnackId: string;
const createdCartIds: string[] = [];

beforeAll(async () => {
  const { data: byoSnacks } = await admin
    .from("snacks")
    .select("id")
    .eq("is_byo_eligible", true)
    .limit(8);
  byoSnackIds = byoSnacks!.map((s) => s.id);

  const { data: nonByoSnack } = await admin
    .from("snacks")
    .select("id")
    .eq("is_byo_eligible", false)
    .limit(1)
    .single();
  nonByoSnackId = nonByoSnack!.id;
});

afterEach(async () => {
  for (const cartId of createdCartIds) {
    await admin.from("carts").delete().eq("id", cartId);
  }
  createdCartIds.length = 0;
});

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/cart/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function findCreatedCartId(): Promise<string | null> {
  const { data } = await admin
    .from("carts")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data?.id ?? null;
}

describe("POST /api/cart/items", () => {
  it("creates a cart_items row and matching cart_item_snacks for a valid 8-item Small submission", async () => {
    const request = makeRequest({
      boxSlug: "build-a-box-small",
      snacks: byoSnackIds.map((snackId) => ({ snackId, quantity: 1 })),
    });

    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(201);

    const { data: cartItem } = await admin
      .from("cart_items")
      .select("id, cart_id, box_id, item_type")
      .eq("id", body.data.cartItemId)
      .single();
    expect(cartItem!.item_type).toBe("box");
    createdCartIds.push(cartItem!.cart_id);

    const { data: snackRows } = await admin
      .from("cart_item_snacks")
      .select("snack_id, quantity")
      .eq("cart_item_id", cartItem!.id);

    expect(snackRows).toHaveLength(8);
    const totalQuantity = snackRows!.reduce((sum, r) => sum + r.quantity, 0);
    expect(totalQuantity).toBe(8);
  });

  it("rejects a submission with the wrong item count for the box size", async () => {
    const request = makeRequest({
      boxSlug: "build-a-box-small",
      snacks: byoSnackIds.slice(0, 7).map((snackId) => ({ snackId, quantity: 1 })),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const cartId = await findCreatedCartId();
    if (cartId) createdCartIds.push(cartId);
  });

  it("rejects a submission containing a BYO-ineligible snack", async () => {
    const request = makeRequest({
      boxSlug: "build-a-box-small",
      snacks: [
        ...byoSnackIds.slice(0, 7).map((snackId) => ({ snackId, quantity: 1 })),
        { snackId: nonByoSnackId, quantity: 1 },
      ],
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const cartId = await findCreatedCartId();
    if (cartId) createdCartIds.push(cartId);
  });

  it("rejects an unknown box slug", async () => {
    const request = makeRequest({
      boxSlug: "does-not-exist",
      snacks: [{ snackId: byoSnackIds[0], quantity: 8 }],
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it("sets an anonymous_cart_id cookie on first submission, reuses the same cart on the next", async () => {
    const first = await POST(
      makeRequest({
        boxSlug: "build-a-box-small",
        snacks: byoSnackIds.map((snackId) => ({ snackId, quantity: 1 })),
      })
    );
    const setCookie = first.headers.get("set-cookie");
    expect(setCookie).toMatch(/anonymous_cart_id=/);

    const cookieValue = setCookie!.match(/anonymous_cart_id=([^;]+)/)![1];

    const firstBody = await first.json();
    const { data: firstCartItem } = await admin
      .from("cart_items")
      .select("cart_id")
      .eq("id", firstBody.data.cartItemId)
      .single();
    createdCartIds.push(firstCartItem!.cart_id);

    const second = new NextRequest("http://localhost:3000/api/cart/items", {
      method: "POST",
      headers: { cookie: `anonymous_cart_id=${cookieValue}` },
      body: JSON.stringify({
        boxSlug: "build-a-box-small",
        snacks: byoSnackIds.map((snackId) => ({ snackId, quantity: 1 })),
      }),
    });
    const secondResponse = await POST(second);
    const secondBody = await secondResponse.json();

    const { data: secondCartItem } = await admin
      .from("cart_items")
      .select("cart_id")
      .eq("id", secondBody.data.cartItemId)
      .single();

    expect(secondCartItem!.cart_id).toBe(firstCartItem!.cart_id);
  });
});
