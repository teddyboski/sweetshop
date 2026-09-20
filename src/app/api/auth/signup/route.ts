import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { signupSchema } from "@/lib/validations/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit/check";

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request, RATE_LIMITS.auth);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const signUpMetadata: Record<string, string> = {};
  if (parsed.data.referralCode) signUpMetadata.referral_code = parsed.data.referralCode;
  if (parsed.data.offerCode) signUpMetadata.offer_code = parsed.data.offerCode;

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    ...(Object.keys(signUpMetadata).length > 0 ? { options: { data: signUpMetadata } } : {}),
  });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 400 });
  }

  return NextResponse.json(
    { data: { userId: data.user?.id ?? null }, error: null },
    { status: 201 }
  );
}
