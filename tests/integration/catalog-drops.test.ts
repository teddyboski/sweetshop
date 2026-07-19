import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const anonClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

describe("catalog demo drops", () => {
  it("has one active drop under its quantity_limit and one sold out", async () => {
    const { data, error } = await anonClient
      .from("drops")
      .select("quantity_limit, units_sold, starts_at, ends_at")
      .order("quantity_limit", { ascending: false });

    expect(error).toBeNull();
    expect(data).toHaveLength(2);

    const active = data!.find((d) => d.units_sold < d.quantity_limit);
    const soldOut = data!.find((d) => d.units_sold >= d.quantity_limit);

    expect(active).toBeDefined();
    expect(soldOut).toBeDefined();
    expect(new Date(active!.starts_at).getTime()).toBeLessThan(Date.now());
    expect(new Date(active!.ends_at).getTime()).toBeGreaterThan(Date.now());
  });
});
