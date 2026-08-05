import { createPublicSupabaseClient } from "@/lib/supabase/public";

interface ProductImageRow {
  image_url: string;
  is_primary: boolean;
}

function primaryImageUrl(images: ProductImageRow[] | null | undefined): string | null {
  if (!images || images.length === 0) return null;
  return images.find((img) => img.is_primary)?.image_url ?? images[0].image_url;
}

export async function getActiveBoxes() {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from("boxes")
    .select(
      "id, slug, title, description, price_cents, is_subscription, cadence, box_type, slot_count, product_images(image_url, is_primary)"
    )
    .eq("status", "active")
    .order("title");
  if (error) throw error;
  return data.map(({ product_images, ...box }) => ({
    ...box,
    imageUrl: primaryImageUrl(product_images),
  }));
}

export async function getSellableSnacks(filters: { category?: string; tag?: string } = {}) {
  const supabase = createPublicSupabaseClient();
  let query = supabase
    .from("snacks")
    .select(
      "id, slug, name, brand, category, tags, price_cents, is_sellable_individually, product_images(image_url, is_primary)"
    )
    .eq("is_sellable_individually", true)
    .order("name");

  if (filters.category) query = query.eq("category", filters.category);
  if (filters.tag) query = query.contains("tags", [filters.tag]);

  const { data, error } = await query;
  if (error) throw error;
  return data.map(({ product_images, ...snack }) => ({
    ...snack,
    imageUrl: primaryImageUrl(product_images),
  }));
}

export async function getByoEligibleSnacks() {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from("snacks")
    .select("id, slug, name, brand, category, tags, price_cents")
    .eq("is_byo_eligible", true)
    .order("name");
  if (error) throw error;
  return data;
}

export async function getBoxBySlug(slug: string) {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from("boxes")
    .select(
      "id, slug, title, description, price_cents, is_subscription, cadence, box_type, slot_count, product_images(image_url, is_primary)"
    )
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) return data;
  const { product_images, ...box } = data;
  return { ...box, imageUrl: primaryImageUrl(product_images) };
}

export async function getSnackBySlug(slug: string) {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from("snacks")
    .select(
      "id, slug, name, brand, category, tags, price_cents, is_sellable_individually, product_images(image_url, is_primary)"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return data;
  const { product_images, ...snack } = data;
  return { ...snack, imageUrl: primaryImageUrl(product_images) };
}

export async function getBoxItems(boxId: string) {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from("box_items")
    .select("quantity, snacks(id, slug, name)")
    .eq("box_id", boxId);
  if (error) throw error;
  return data;
}

export async function getDropById(id: string) {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from("drops")
    .select("id, box_id, starts_at, ends_at, quantity_limit, units_sold, boxes(slug, title, price_cents)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function searchCatalog(query: string) {
  const supabase = createPublicSupabaseClient();
  const [boxes, snacks] = await Promise.all([
    supabase
      .from("boxes")
      .select("id, slug, title, price_cents, product_images(image_url, is_primary)")
      .eq("status", "active")
      .textSearch("search_vector", query),
    supabase
      .from("snacks")
      .select("id, slug, name, price_cents, product_images(image_url, is_primary)")
      .eq("is_sellable_individually", true)
      .textSearch("search_vector", query),
  ]);
  if (boxes.error) throw boxes.error;
  if (snacks.error) throw snacks.error;
  return {
    boxes: boxes.data?.map(({ product_images, ...box }) => ({ ...box, imageUrl: primaryImageUrl(product_images) })),
    snacks: snacks.data?.map(({ product_images, ...snack }) => ({ ...snack, imageUrl: primaryImageUrl(product_images) })),
  };
}
