import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.auth);
  if (rateLimitResponse) return rateLimitResponse;

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer (.+)$/)?.[1];
  if (!token) {
    return NextResponse.json(
      { data: null, error: "Missing bearer token" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  );

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 400 });
  }

  return NextResponse.json(
    { data: { message: "Password updated successfully." }, error: null },
    { status: 200 }
  );
}
