import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { calculateCartTotal, type CartLineForTotal } from "@/lib/cart/calculate-total";
import { resolveMerchPriceCents } from "@/lib/merch/resolve-price";

export interface CartLine {
  id: string;
  itemType: "box" | "snack" | "merch";
  quantity: number;
  unitPriceCents: number;
  name: string;
  slug: string | null;
  isBuildABox: boolean;
  slotCount: number | null;
  isSubscription: boolean;
  cadence: string | null;
  snackSelections?: Array<{ snackId: string; name: string; quantity: number }>;
  /** Set only on merch lines - e.g. "Medium / Navy" built from the variant's size/color, shown alongside the item name. */
  variantLabel?: string | null;
  /**
   * The actual boxes.id / snacks.id (not this cart_item's own id) - added
   * Milestone 13 so the mobile PaymentIntent webhook handler can build
   * order_items directly from cart contents without a second query. Every
   * existing caller of getCartContents ignores unrecognized fields, so this
   * is purely additive.
   */
  boxId: string | null;
  snackId: string | null;
  /** Milestone 16: mirrors boxId/snackId above for merch lines. */
  merchItemId: string | null;
  merchVariantId: string | null;
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
      "id, item_type, quantity, box_id, snack_id, merch_item_id, merch_variant_id, boxes(title, slug, price_cents, box_type, slot_count, is_subscription, cadence), snacks(name, slug, price_cents), merch_items(name, slug, price_cents), merch_variants(size, color, price_cents_override)"
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
        isSubscription: item.boxes.is_subscription,
        cadence: item.boxes.cadence,
        snackSelections,
        boxId: item.box_id,
        snackId: null,
        merchItemId: null,
        merchVariantId: null,
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
        isSubscription: false,
        cadence: null,
        boxId: null,
        snackId: item.snack_id,
        merchItemId: null,
        merchVariantId: null,
      });
    } else if (item.item_type === "merch" && item.merch_items && item.merch_variants) {
      const variantLabel = [item.merch_variants.size, item.merch_variants.color].filter(Boolean).join(" / ") || null;

      lines.push({
        id: item.id,
        itemType: "merch",
        quantity: item.quantity,
        unitPriceCents: resolveMerchPriceCents(item.merch_items, item.merch_variants),
        name: item.merch_items.name,
        slug: item.merch_items.slug,
        isBuildABox: false,
        slotCount: null,
        isSubscription: false,
        cadence: null,
        variantLabel,
        boxId: null,
        snackId: null,
        merchItemId: item.merch_item_id,
        merchVariantId: item.merch_variant_id,
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
