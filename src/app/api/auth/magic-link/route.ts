import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { magicLinkSchema } from "@/lib/validations/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = magicLinkSchema.safeParse(body);

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

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
  });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 400 });
  }

  // Always return the same success shape regardless of whether the email
  // exists, to avoid leaking account existence via response differences.
  return NextResponse.json(
    { data: { message: "If an account exists, a login link has been sent." }, error: null },
    { status: 200 }
  );
}
