import { notFound } from "next/navigation";
import { getSnackBySlug } from "@/lib/supabase/queries/catalog";
import { formatPriceCents } from "@/lib/utils";
import { ProductImage } from "@/components/shared/product-image";
import { AddToCartButton } from "@/components/features/cart/add-to-cart-button";

export const revalidate = 60;

interface SnackDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: SnackDetailPageProps) {
  const { slug } = await params;
  const snack = await getSnackBySlug(slug);
  if (!snack || !snack.is_sellable_individually) return { title: "Snack not found | The Sweet Shop" };

  return {
    title: `${snack.name} | The Sweet Shop`,
    description: `${snack.name}${snack.brand ? ` by ${snack.brand}` : ""} - ${formatPriceCents(snack.price_cents ?? 0)} from The Sweet Shop.`,
    alternates: { canonical: `/shop/snack/${snack.slug}` },
  };
}

export default async function SnackDetailPage({ params }: SnackDetailPageProps) {
  const { slug } = await params;
  const snack = await getSnackBySlug(slug);

  // is_sellable_individually is a business visibility rule, not RLS/security -
  // a snack can exist (e.g. BYO-only components) without being a storefront
  // product. Treated identically to a nonexistent slug. See Milestone 3 plan,
  // Product Decision #3.
  if (!snack || !snack.is_sellable_individually) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <ProductImage imageUrl={null} alt={snack.name} className="rounded-xl" />
        <div>
          <h1 className="font-heading text-2xl font-semibold">{snack.name}</h1>
          {snack.brand && <p className="text-sm text-muted-foreground">{snack.brand}</p>}
          <p className="mt-2 text-xl font-medium">{formatPriceCents(snack.price_cents ?? 0)}</p>
          {snack.category && (
            <p className="mt-4 text-sm capitalize text-muted-foreground">Category: {snack.category}</p>
          )}
          {snack.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {snack.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4">
            <AddToCartButton payload={{ itemType: "snack", snackId: snack.id, quantity: 1 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
