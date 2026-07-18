import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { forgotPasswordSchema } from "@/lib/validations/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);

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

  // Result intentionally not checked against the response: Supabase's
  // resetPasswordForEmail always resolves without error even for an
  // unknown address (it does not report account existence), and we
  // deliberately return the same message either way for the same reason.
  await supabase.auth.resetPasswordForEmail(parsed.data.email);

  return NextResponse.json(
    { data: { message: "If an account exists, a password reset link has been sent." }, error: null },
    { status: 200 }
  );
}
