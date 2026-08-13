import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { MerchForm } from "@/components/features/admin/merch-form";
import { MerchVariantsEditor } from "@/components/features/admin/merch-variants-editor";

export const dynamic = "force-dynamic";

interface AdminMerchEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminMerchEditPage({ params }: AdminMerchEditPageProps) {
  const { id } = await params;
  const admin = createAdminSupabaseClient();
  const { data: merchItem } = await admin.from("merch_items").select("*").eq("id", id).maybeSingle();

  if (!merchItem) notFound();

  const { data: variantRows } = await admin
    .from("merch_variants")
    .select("id, size, color, sku, price_cents_override, status, merch_inventory(quantity_on_hand)")
    .eq("merch_item_id", id)
    .order("created_at", { ascending: true });

  const variants = (variantRows ?? []).map((v) => ({
    id: v.id,
    size: v.size,
    color: v.color,
    sku: v.sku,
    priceCentsOverride: v.price_cents_override,
    status: v.status as "active" | "archived",
    quantityOnHand: v.merch_inventory?.quantity_on_hand ?? 0,
  }));

  return (
    <div className="max-w-lg">
      <h1 className="font-heading text-2xl font-semibold">Edit {merchItem.name}</h1>
      <div className="mt-6 rounded-lg border p-4">
        <MerchForm merchItem={merchItem} />
      </div>
      <MerchVariantsEditor merchItemId={merchItem.id} variants={variants} />
    </div>
  );
}
