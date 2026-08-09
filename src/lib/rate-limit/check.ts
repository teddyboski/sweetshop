import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Milestone 10, Task 1: shared rate-limit gate for unauthenticated public
 * Route Handlers (auth, checkout, cart - see plan doc Product Decision #2).
 * Wraps the check_rate_limit RPC (fixed-window counter in Postgres, see
 * that migration's own comments for why no Redis/Upstash dependency was
 * added here).
 */

export interface RateLimitConfig {
  /** Route-group prefix so different endpoints don't share one bucket per IP. */
  scope: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Vercel and most reverse proxies set x-forwarded-for to a comma-separated
 * list with the original client first. Falls back to a constant in local
 * dev (no proxy in front of `next dev`), matching the same
 * only-matters-in-production posture as checkout/session's own
 * NEXT_PUBLIC_APP_URL fallback.
 */
function resolveClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstIp = forwardedFor?.split(",")[0]?.trim();
  return firstIp || "local-dev";
}

/**
 * Returns null when the request is within its limit (caller proceeds
 * normally), or a ready-to-return 429 NextResponse when it isn't. Never
 * throws - a database error here fails open (returns null) rather than
 * taking down every public endpoint if rate-limit bookkeeping itself has a
 * problem; the endpoint's own logic is still the real protection surface.
 */
export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const ip = resolveClientIp(request);
  const key = `${config.scope}:${ip}`;

  const admin = createAdminSupabaseClient();
  const { data: withinLimit, error } = await admin.rpc("check_rate_limit", {
    p_key: key,
    p_limit: config.limit,
    p_window_seconds: config.windowSeconds,
  });

  if (error) {
    return null;
  }

  if (withinLimit) {
    return null;
  }

  return NextResponse.json(
    { data: null, error: { message: "Too many requests. Please try again shortly." } },
    { status: 429, headers: { "Retry-After": String(config.windowSeconds) } }
  );
}

/**
 * Rate-limit tiers from the plan doc, Product Decision #2. Kept as named
 * presets (not raw numbers scattered across route files) so all auth
 * routes moving in lockstep is a one-line change here, not a search across
 * five files.
 */
export const RATE_LIMITS = {
  auth: { scope: "auth", limit: 60, windowSeconds: 600 } satisfies RateLimitConfig,
  checkout: { scope: "checkout", limit: 30, windowSeconds: 60 } satisfies RateLimitConfig,
  // Milestone 12 (mobile): read-only catalog browsing, no server-side cache
  // in front of it the way ISR gives the web pages. Generous since normal
  // browsing (scrolling a grid, opening detail screens, typing a search)
  // can easily fire a dozen+ requests a minute - this is abuse protection,
  // not a browsing-pace limiter.
  catalog: { scope: "catalog", limit: 300, windowSeconds: 60 } satisfies RateLimitConfig,
} as const;
