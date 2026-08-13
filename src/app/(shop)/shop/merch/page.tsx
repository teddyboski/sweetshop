import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { getMerchItems } from "@/lib/supabase/queries/catalog";
import { formatPriceCents } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProductImage } from "@/components/shared/product-image";

export const revalidate = 60;

export const metadata = {
  title: "Merchandise | The Sweet Shop",
  description: "In-house apparel and goods from The Sweet Shop.",
};

/** Milestone 18 gives this a home-page tile of its own; this page mirrors the shop/page.tsx grid pattern, one product family at a time instead of everything on one filtered page. */
export default async function MerchPage() {
  const merchItems = await getMerchItems();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold">Merchandise</h1>
      <p className="mt-1 text-muted-foreground">In-house apparel and goods, made by us.</p>

      {merchItems.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center text-muted-foreground">
          <PackageSearch className="size-10" aria-hidden="true" />
          <p>Nothing here yet - check back soon.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {merchItems.map((item) => (
            <Link key={item.id} href={`/shop/merch/${item.slug}`}>
              <Card size="sm">
                <ProductImage imageUrl={item.imageUrl} alt={item.name} />
                <CardHeader>
                  <CardTitle>{item.name}</CardTitle>
                  <CardDescription>{formatPriceCents(item.price_cents)}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
