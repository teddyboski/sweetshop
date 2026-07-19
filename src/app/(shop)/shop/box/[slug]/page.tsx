import { notFound } from "next/navigation";
import { getBoxBySlug, getBoxItems } from "@/lib/supabase/queries/catalog";
import { formatPriceCents } from "@/lib/utils";
import { ProductImage } from "@/components/shared/product-image";

export const revalidate = 60;

interface BoxDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: BoxDetailPageProps) {
  const { slug } = await params;
  const box = await getBoxBySlug(slug);
  if (!box) return { title: "Box not found | The Sweet Shop" };

  return {
    title: `${box.title} | The Sweet Shop`,
    description: box.description ?? `${box.title} - ${formatPriceCents(box.price_cents)} from The Sweet Shop.`,
    alternates: { canonical: `/shop/box/${box.slug}` },
  };
}

export default async function BoxDetailPage({ params }: BoxDetailPageProps) {
  const { slug } = await params;
  const box = await getBoxBySlug(slug);
  if (!box) notFound();

  const items = box.box_type !== "build_a_box" ? await getBoxItems(box.id) : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <ProductImage imageUrl={null} alt={box.title} className="rounded-xl" />
        <div>
          <h1 className="font-heading text-2xl font-semibold">{box.title}</h1>
          <p className="mt-2 text-xl font-medium">
            {formatPriceCents(box.price_cents)}
            {box.is_subscription && <span className="text-sm text-muted-foreground"> / {box.cadence}</span>}
          </p>
          {box.description && <p className="mt-4 text-muted-foreground">{box.description}</p>}

          {box.box_type === "build_a_box" && (
            <p className="mt-4 text-sm text-muted-foreground">
              Pick exactly {box.slot_count} snacks to build this box.
            </p>
          )}

          {items.length > 0 && (
            <div className="mt-6">
              <h2 className="font-heading text-sm font-medium uppercase tracking-wide text-muted-foreground">
                What&apos;s typically inside
              </h2>
              <ul className="mt-2 list-inside list-disc text-sm">
                {items.map((item, i) => (
                  <li key={i}>{item.snacks?.name}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Contents rotate weekly and may vary - this is a representative example, not a guaranteed list.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
