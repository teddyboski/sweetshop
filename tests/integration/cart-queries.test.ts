// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { POST } from "@/app/api/cart/items/route";
import { getCartContents } from "@/lib/supabase/queries/cart";

const admin = createAdminSupabaseClient();
const createdCartIds: string[] = [];

afterEach(async () => {
  for (const cartId of createdCartIds) {
    await admin.from("carts").delete().eq("id", cartId);
  }
  createdCartIds.length = 0;
});

function requestWithCookie(body: unknown, cookieValue?: string) {
  return new NextRequest("http://localhost:3000/api/cart/items", {
    method: "POST",
    headers: cookieValue ? { cookie: `anonymous_cart_id=${cookieValue}` } : {},
    body: JSON.stringify(body),
  });
}

describe("getCartContents", () => {
  it("returns all three line types with a correct combined total for a mixed cart", async () => {
    const { data: byoSnacks } = await admin.from("snacks").select("id").eq("is_byo_eligible", true).limit(8);
    const byoSnackIds = byoSnacks!.map((s) => s.id);

    const first = await POST(requestWithCookie({ itemType: "box", boxSlug: "munchie-box", quantity: 1 }));
    const firstBody = await first.json();
    expect(first.status, `curated box POST failed: ${JSON.stringify(firstBody)}`).toBe(201);
    const cookieValue = first.headers.get("set-cookie")!.match(/anonymous_cart_id=([^;]+)/)![1];

    const { data: cartItem } = await admin
      .from("cart_items")
      .select("cart_id")
      .eq("id", firstBody.data.cartItemId)
      .single();
    const cartId = cartItem!.cart_id;
    createdCartIds.push(cartId);

    const { data: sellableSnack } = await admin
      .from("snacks")
      .select("id")
      .eq("is_sellable_individually", true)
      .neq("id", byoSnackIds[0])
      .limit(1)
      .single();

    const second = await POST(
      requestWithCookie({ itemType: "snack", snackId: sellableSnack!.id, quantity: 2 }, cookieValue)
    );
    const secondBody = await second.json();
    expect(second.status, `snack POST failed: ${JSON.stringify(secondBody)}`).toBe(201);

    const third = await POST(
      requestWithCookie(
        {
          itemType: "build_a_box",
          boxSlug: "build-a-box-small",
          snacks: byoSnackIds.map((snackId) => ({ snackId, quantity: 1 })),
        },
        cookieValue
      )
    );
    const thirdBody = await third.json();
    expect(third.status, `build-a-box POST failed: ${JSON.stringify(thirdBody)}`).toBe(201);

    const contents = await getCartContents(cartId);

    expect(contents.lines).toHaveLength(3);

    const boxLine = contents.lines.find((l) => l.name === "The Munchie Box");
    const snackLine = contents.lines.find((l) => !l.isBuildABox && l.itemType === "snack");
    const byoLine = contents.lines.find((l) => l.isBuildABox);

    expect(boxLine).toBeDefined();
    expect(boxLine!.quantity).toBe(1);

    expect(snackLine).toBeDefined();
    expect(snackLine!.quantity).toBe(2);

    expect(byoLine).toBeDefined();
    expect(byoLine!.snackSelections).toHaveLength(8);

    const expectedSubtotal = boxLine!.unitPriceCents * 1 + snackLine!.unitPriceCents * 2 + byoLine!.unitPriceCents * 1;
    expect(contents.total.subtotalCents).toBe(expectedSubtotal);
    expect(contents.total.hasBox).toBe(true);
    expect(contents.total.shippingCents).toBe(0);
  });

  it("returns an empty lines array and zero total for a cart with nothing in it", async () => {
    const { data: newCart } = await admin.from("carts").insert({ anonymous_id: crypto.randomUUID() }).select("id").single();
    createdCartIds.push(newCart!.id);

    const contents = await getCartContents(newCart!.id);
    expect(contents.lines).toHaveLength(0);
    expect(contents.total.totalCents).toBe(0);
  });
});
