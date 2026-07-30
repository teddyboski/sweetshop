import "server-only";
import type { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-user";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export interface RequireAdminResult {
  userId?: string;
  error?: string;
  status?: number;
}

/**
 * Milestone 8: every admin Route Handler needs both bearer-token auth and
 * an admin-role check - src/app/api/admin/users/[id]/role/route.ts
 * (Milestone 2) already did this inline once; extracted here now that this
 * milestone is about to repeat the exact same two-step check across
 * roughly ten more routes (boxes, snacks, uploads, inventory, orders,
 * customers, rewards, promotions, drops) - see CLAUDE.md's "repeat
 * yourself twice before extracting a helper."
 */
export async function requireAdmin(request: NextRequest): Promise<RequireAdminResult> {
  const authResult = await getAuthenticatedUser(request);
  if (authResult.error || !authResult.user) {
    return { error: authResult.error, status: authResult.status };
  }

  const admin = createAdminSupabaseClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", authResult.user.id)
    .single();

  if (error || profile?.role !== "admin") {
    return { error: "Forbidden - admin role required", status: 403 };
  }

  return { userId: authResult.user.id };
}
