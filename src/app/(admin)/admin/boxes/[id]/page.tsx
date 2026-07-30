import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { BoxForm } from "@/components/features/admin/box-form";

export const dynamic = "force-dynamic";

interface AdminBoxEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminBoxEditPage({ params }: AdminBoxEditPageProps) {
  const { id } = await params;
  const admin = createAdminSupabaseClient();
  const { data: box } = await admin.from("boxes").select("*").eq("id", id).is("deleted_at", null).maybeSingle();

  if (!box) notFound();

  return (
    <div className="max-w-lg">
      <h1 className="font-heading text-2xl font-semibold">Edit {box.title}</h1>
      <div className="mt-6 rounded-lg border p-4">
        <BoxForm box={box} />
      </div>
    </div>
  );
}
