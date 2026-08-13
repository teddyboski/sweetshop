import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { formatPriceCents } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProductImage } from "@/components/shared/product-image";
import type { getSellableSnacks } from "@/lib/supabase/queries/catalog";

type Snack = Awaited<ReturnType<typeof getSellableSnacks>>[number];

interface SnackGridProps {
  title: string;
  description: string;
  snacks: Snack[];
  emptyMessage: string;
  /** Optional filter pills rendered above the grid (e.g. SnackCategoryChips). */
  filters?: React.ReactNode;
}

/**
 * Shared grid for the new individually-sellable-snacks pages (Snacks,
 * House Snacks), mirroring the Snacks section card markup from
 * (shop)/shop/page.tsx exactly - same card size/shape a snack already has
 * everywhere else, just reused instead of re-typed per page. See
 * BoxCategoryGrid for the equivalent on the boxes side.
 */
export function SnackGrid({ title, description, snacks, emptyMessage, filters }: SnackGridProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-muted-foreground">{description}</p>

      {filters}

      {snacks.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center text-muted-foreground">
          <PackageSearch className="size-10" aria-hidden="true" />
          <p>{emptyMessage}</p>
          <Link href="/shop" className="text-primary underline underline-offset-4">
            Browse everything instead
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {snacks.map((snack) => (
            <Link key={snack.id} href={`/shop/snack/${snack.slug}`}>
              <Card size="sm">
                <ProductImage imageUrl={snack.imageUrl} alt={snack.name} />
                <CardHeader>
                  <CardTitle>{snack.name}</CardTitle>
                  <CardDescription>{formatPriceCents(snack.price_cents ?? 0)}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
