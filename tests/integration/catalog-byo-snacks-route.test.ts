// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { GET as getByoSnacks } from "@/app/api/catalog/byo-snacks/route";

vi.mock("@/lib/rate-limit/check", () => ({
  checkRateLimit: async () => null,
  RATE_LIMITS: { catalog: { scope: "catalog", limit: 300, windowSeconds: 60 } },
}));

const admin = createAdminSupabaseClient();

function makeRequest() {
  return new NextRequest("http://localhost:3000/api/catalog/byo-snacks", { method: "GET" });
}

describe("GET /api/catalog/byo-snacks", () => {
  it("returns only is_byo_eligible snacks, matching the DB flag exactly - not is_sellable_individually", async () => {
    const response = await getByoSnacks(makeRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const returnedIds: string[] = body.data.map((s: { id: string }) => s.id);
    const { data: expectedRows } = await admin.from("snacks").select("id").eq("is_byo_eligible", true);
    const expectedIds = (expectedRows ?? []).map((s) => s.id);

    expect(returnedIds.sort()).toEqual(expectedIds.sort());
  });

  it("never includes a snack with is_byo_eligible = false, even if it's individually sellable", async () => {
    const { data: nonByoSellable } = await admin
      .from("snacks")
      .select("id")
      .eq("is_byo_eligible", false)
      .eq("is_sellable_individually", true)
      .limit(1)
      .maybeSingle();
    if (!nonByoSellable) return; // depends on current seed data having such a row

    const response = await getByoSnacks(makeRequest());
    const body = await response.json();
    const returnedIds: string[] = body.data.map((s: { id: string }) => s.id);
    expect(returnedIds).not.toContain(nonByoSellable.id);
  });

  it("each returned snack has a price and no nutrition/inventory fields leaked (mirrors the web BYO picker's own select list)", async () => {
    const response = await getByoSnacks(makeRequest());
    const body = await response.json();
    for (const snack of body.data) {
      expect(snack).toHaveProperty("id");
      expect(snack).toHaveProperty("name");
      expect(snack).toHaveProperty("price_cents");
      expect(snack).not.toHaveProperty("nutrition_json");
      expect(snack).not.toHaveProperty("inventory_count");
    }
  });
});
