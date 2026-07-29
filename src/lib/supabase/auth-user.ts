import "server-only";
import type { NextRequest } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export interface AuthenticatedUserResult {
  user?: User;
  error?: string;
  status?: number;
}

/**
 * Shared bearer-token auth resolver for the /api/account/* Route Handlers
 * added in Milestone 7 - same mobile-readiness convention every cart/
 * checkout Route Handler already follows (see resolve-cart.ts's header
 * comment: auth via an optional bearer token, never a browser cookie
 * session). Extracted here once this became the third call site (portal-
 * session, preferences, addresses) - see CLAUDE.md's "repeat yourself twice
 * before extracting a helper".
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUserResult> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return { error: "Missing bearer token", status: 401 };

  const authClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user) return { error: "Invalid or expired session", status: 401 };
  return { user };
}
