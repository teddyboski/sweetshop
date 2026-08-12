import { notFound } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { BoxForm } from "@/components/features/admin/box-form";
import { BoxItemsEditor } from "@/components/features/admin/box-items-editor";

export const dynamic = "force-dynamic";

interface AdminBoxEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminBoxEditPage({ params }: AdminBoxEditPageProps) {
  const { id } = await params;
  const admin = createAdminSupabaseClient();
  const { data: box } = await admin.from("boxes").select("*").eq("id", id).is("deleted_at", null).maybeSingle();

  if (!box) notFound();

  // build_a_box contents are the customer's own selection at checkout
  // (cart_item_snacks/order_item_snacks) - box_items only applies to
  // curated/mystery boxes, which are entirely staff-curated.
  let itemRows: { id: string; snackId: string; snackName: string; quantity: number }[] = [];
  let availableSnacks: { id: string; name: string }[] = [];

  if (box.box_type !== "build_a_box") {
    const { data: items } = await admin
      .from("box_items")
      .select("id, snack_id, quantity, snacks(name)")
      .eq("box_id", id)
      .order("created_at", { ascending: true });

    itemRows = (items ?? []).map((item) => ({
      id: item.id,
      snackId: item.snack_id,
      snackName: (item.snacks as unknown as { name: string } | null)?.name ?? "(unknown snack)",
      quantity: item.quantity,
    }));

    const { data: snacks } = await admin
      .from("snacks")
      .select("id, name")
      .eq("status", "active")
      .order("name", { ascending: true });
    availableSnacks = snacks ?? [];
  }

  return (
    <div className="max-w-lg">
      <h1 className="font-heading text-2xl font-semibold">Edit {box.title}</h1>
      <div className="mt-6 rounded-lg border p-4">
        <BoxForm box={box} />
      </div>
      {box.box_type !== "build_a_box" && (
        <BoxItemsEditor boxId={box.id} items={itemRows} availableSnacks={availableSnacks} />
      )}
    </div>
  );
}
