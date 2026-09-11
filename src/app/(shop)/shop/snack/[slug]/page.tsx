import { notFound } from "next/navigation";
import { getSnackBySlug } from "@/lib/supabase/queries/catalog";
import { formatPriceCents } from "@/lib/utils";
import { SnackDetailClient } from "@/components/features/snacks/snack-detail-client";

export const revalidate = 60;

interface SnackDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: SnackDetailPageProps) {
  const { slug } = await params;
  const snack = await getSnackBySlug(slug);
  if (!snack || !snack.is_sellable_individually) return { title: "Snack not found | The Sweet Shop" };

  const price = snack.variants.length > 0 ? snack.variants[0].price_cents : snack.price_cents ?? 0;
  return {
    title: `${snack.name} | The Sweet Shop`,
    description: `${snack.name}${snack.brand ? ` by ${snack.brand}` : ""} - from ${formatPriceCents(price)} from The Sweet Shop.`,
    alternates: { canonical: `/shop/snack/${snack.slug}` },
  };
}

export default async function SnackDetailPage({ params }: SnackDetailPageProps) {
  const { slug } = await params;
  const snack = await getSnackBySlug(slug);

  if (!snack || !snack.is_sellable_individually) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <SnackDetailClient snack={snack} />
    </div>
  );
}