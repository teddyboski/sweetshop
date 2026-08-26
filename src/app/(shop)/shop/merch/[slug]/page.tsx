import { notFound } from "next/navigation";
import { getMerchItemBySlug } from "@/lib/supabase/queries/catalog";
import { ZoomableProductImage } from "@/components/shared/zoomable-product-image";
import { MerchVariantPicker } from "@/components/features/merch/merch-variant-picker";

export const revalidate = 60;

interface MerchDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: MerchDetailPageProps) {
  const { slug } = await params;
  const merchItem = await getMerchItemBySlug(slug);
  if (!merchItem) return { title: "Item not found | The Sweet Shop" };

  return {
    title: `${merchItem.name} | The Sweet Shop`,
    description: merchItem.description ?? `${merchItem.name} from The Sweet Shop.`,
    alternates: { canonical: `/shop/merch/${merchItem.slug}` },
  };
}

export default async function MerchDetailPage({ params }: MerchDetailPageProps) {
  const { slug } = await params;
  const merchItem = await getMerchItemBySlug(slug);

  if (!merchItem) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <ZoomableProductImage imageUrl={merchItem.imageUrl} alt={merchItem.name} className="rounded-xl" />
        <div>
          <h1 className="font-heading text-2xl font-semibold">{merchItem.name}</h1>
          {merchItem.category && <p className="text-sm capitalize text-muted-foreground">{merchItem.category}</p>}
          {merchItem.description && <p className="mt-4 text-sm text-muted-foreground">{merchItem.description}</p>}

          <MerchVariantPicker variants={merchItem.variants} />
        </div>
      </div>
    </div>
  );
}
