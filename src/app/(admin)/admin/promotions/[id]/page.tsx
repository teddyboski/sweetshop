import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { PromotionForm } from "@/components/features/admin/promotion-form";

export const dynamic = "force-dynamic";

interface AdminPromotionEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminPromotionEditPage({ params }: AdminPromotionEditPageProps) {
  const { id } = await params;
  const admin = createAdminSupabaseClient();
  const { data: promotion } = await admin.from("promotions").select("*").eq("id", id).maybeSingle();

  if (!promotion) notFound();

  return (
    <div className="max-w-lg">
      <h1 className="font-heading text-2xl font-semibold">Edit {promotion.code}</h1>
      <div className="mt-6 rounded-lg border p-4">
        <PromotionForm promotion={promotion} />
      </div>
    </div>
  );
}
