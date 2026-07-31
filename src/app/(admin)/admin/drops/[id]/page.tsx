import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { DropForm } from "@/components/features/admin/drop-form";

export const dynamic = "force-dynamic";

interface AdminDropEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminDropEditPage({ params }: AdminDropEditPageProps) {
  const { id } = await params;
  const admin = createAdminSupabaseClient();
  const { data: drop } = await admin.from("drops").select("*, boxes(title)").eq("id", id).maybeSingle();

  if (!drop) notFound();

  const { data: boxes } = await admin
    .from("boxes")
    .select("id, title")
    .is("deleted_at", null)
    .order("title", { ascending: true });

  return (
    <div className="max-w-lg">
      <h1 className="font-heading text-2xl font-semibold">Edit {drop.boxes?.title} drop</h1>
      <div className="mt-6 rounded-lg border p-4">
        <DropForm drop={drop} boxes={boxes ?? []} />
      </div>
    </div>
  );
}
