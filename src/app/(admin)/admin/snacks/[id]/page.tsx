import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { SnackForm } from "@/components/features/admin/snack-form";

export const dynamic = "force-dynamic";

interface AdminSnackEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminSnackEditPage({ params }: AdminSnackEditPageProps) {
  const { id } = await params;
  const admin = createAdminSupabaseClient();
  const { data: snack } = await admin.from("snacks").select("*").eq("id", id).maybeSingle();

  if (!snack) notFound();

  return (
    <div className="max-w-lg">
      <h1 className="font-heading text-2xl font-semibold">Edit {snack.name}</h1>
      <div className="mt-6 rounded-lg border p-4">
        <SnackForm snack={snack} />
      </div>
    </div>
  );
}
