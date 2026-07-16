import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// Anonymous (unauthenticated) client - no session, no bearer token.
const anonClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

describe("RLS default-deny", () => {
  it("anonymous user cannot read audit_logs", async () => {
    const { data, error } = await anonClient.from("audit_logs").select("*");
    // RLS should either return zero rows or a permission error - never data.
    expect(data ?? []).toHaveLength(0);
    void error;
  });

  it("anonymous user cannot read orders", async () => {
    const { data } = await anonClient.from("orders").select("*");
    expect(data ?? []).toHaveLength(0);
  });

  it("anonymous user cannot read profiles", async () => {
    const { data } = await anonClient.from("profiles").select("*");
    expect(data ?? []).toHaveLength(0);
  });

  it("anonymous user cannot insert into audit_logs", async () => {
    const { error } = await anonClient
      .from("audit_logs")
      .insert({ action: "test", entity_type: "test", entity_id: crypto.randomUUID() });
    expect(error).not.toBeNull();
  });
});