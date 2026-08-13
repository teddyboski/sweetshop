import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { formatPriceCents } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProductImage } from "@/components/shared/product-image";
import type { getActiveBoxes } from "@/lib/supabase/queries/catalog";

type Box = Awaited<ReturnType<typeof getActiveBoxes>>[number];

interface BoxCategoryGridProps {
  title: string;
  description: string;
  boxes: Box[];
  /**
   * Shown when this category has zero active boxes. Milestone 18 ships
   * the `category` column and these pages with nothing tagged yet -
   * Ted tags boxes with a category from Admin -> Boxes as his own
   * data-entry task, so an empty state here at launch is expected, not
   * a bug. Keep the copy honest about that rather than implying
   * something's broken.
   */
  emptyMessage: string;
}

/**
 * Milestone 18: shared grid for the new per-category box pages
 * (Snack Boxes, Candy Boxes, Mystery Box), mirroring the Boxes section
 * card markup from (shop)/shop/page.tsx exactly so a box looks the same
 * everywhere it appears.
 */
export function BoxCategoryGrid({ title, description, boxes, emptyMessage }: BoxCategoryGridProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-muted-foreground">{description}</p>

      {boxes.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center text-muted-foreground">
          <PackageSearch className="size-10" aria-hidden="true" />
          <p>{emptyMessage}</p>
          <Link href="/shop" className="text-primary underline underline-offset-4">
            Browse everything instead
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boxes.map((box) => (
            <Link key={box.id} href={`/shop/box/${box.slug}`}>
              <Card>
                <ProductImage imageUrl={box.imageUrl} alt={box.title} />
                <CardHeader>
                  <CardTitle>{box.title}</CardTitle>
                  <CardDescription>{formatPriceCents(box.price_cents)}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
