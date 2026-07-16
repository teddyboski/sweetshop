import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/supabase";

const VALID_ROLES = ["customer", "admin"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetUserId } = await params;

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.match(/^Bearer (.+)$/)?.[1];
  if (!token) {
    return NextResponse.json(
      { data: null, error: "Missing bearer token" },
      { status: 401 }
    );
  }

  const authClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      { data: null, error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const admin = createAdminSupabaseClient();

  const { data: callerProfile, error: callerError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerError || callerProfile?.role !== "admin") {
    return NextResponse.json(
      { data: null, error: "Forbidden — admin role required" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const newRole = body?.role;
  if (!VALID_ROLES.includes(newRole)) {
    return NextResponse.json(
      { data: null, error: `role must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 400 }
    );
  }

  const { data: before, error: beforeError } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", targetUserId)
    .single();

  if (beforeError || !before) {
    return NextResponse.json(
      { data: null, error: "Target user not found" },
      { status: 404 }
    );
  }

  const { data: after, error: updateError } = await admin
    .from("profiles")
    .update({ role: newRole })
    .eq("id", targetUserId)
    .select("id, role")
    .single();

  if (updateError || !after) {
    return NextResponse.json(
      { data: null, error: updateError?.message ?? "Update failed" },
      { status: 500 }
    );
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "role_change",
    entity_type: "profiles",
    entity_id: targetUserId,
    before,
    after,
  });

  if (auditError) {
    return NextResponse.json(
      { data: null, error: `Mutation succeeded but audit log failed: ${auditError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: after, error: null }, { status: 200 });
}
