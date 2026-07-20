import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { calculateCartTotal, type CartLineForTotal } from "@/lib/cart/calculate-total";

export interface CartLine {
  id: string;
  itemType: "box" | "snack";
  quantity: number;
  unitPriceCents: number;
  name: string;
  slug: string | null;
  isBuildABox: boolean;
  slotCount: number | null;
  snackSelections?: Array<{ snackId: string; name: string; quantity: number }>;
}

export interface CartContents {
  cartId: string;
  lines: CartLine[];
  total: ReturnType<typeof calculateCartTotal>;
}

export async function getCartContents(cartId: string): Promise<CartContents> {
  const admin = createAdminSupabaseClient();

  const { data: items, error } = await admin
    .from("cart_items")
    .select(
      "id, item_type, quantity, box_id, snack_id, boxes(title, slug, price_cents, box_type, slot_count), snacks(name, slug, price_cents)"
    )
    .eq("cart_id", cartId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const lines: CartLine[] = [];

  for (const item of items ?? []) {
    if (item.item_type === "box" && item.boxes) {
      const isBuildABox = item.boxes.box_type === "build_a_box";
      let snackSelections: CartLine["snackSelections"];

      if (isBuildABox) {
        const { data: selections } = await admin
          .from("cart_item_snacks")
          .select("snack_id, quantity, snacks(name)")
          .eq("cart_item_id", item.id);

        snackSelections = (selections ?? []).map((s) => ({
          snackId: s.snack_id,
          name: s.snacks?.name ?? "Unknown snack",
          quantity: s.quantity,
        }));
      }

      lines.push({
        id: item.id,
        itemType: "box",
        quantity: item.quantity,
        unitPriceCents: item.boxes.price_cents,
        name: item.boxes.title,
        slug: item.boxes.slug,
        isBuildABox,
        slotCount: item.boxes.slot_count,
        snackSelections,
      });
    } else if (item.item_type === "snack" && item.snacks) {
      lines.push({
        id: item.id,
        itemType: "snack",
        quantity: item.quantity,
        unitPriceCents: item.snacks.price_cents ?? 0,
        name: item.snacks.name,
        slug: item.snacks.slug,
        isBuildABox: false,
        slotCount: null,
      });
    }
  }

  const totalInputs: CartLineForTotal[] = lines.map((line) => ({
    itemType: line.itemType,
    unitPriceCents: line.unitPriceCents,
    quantity: line.quantity,
  }));

  return { cartId, lines, total: calculateCartTotal(totalInputs) };
}
