import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { getActiveBoxes, getSellableSnacks, searchCatalog } from "@/lib/supabase/queries/catalog";
import { catalogQuerySchema } from "@/lib/validations/catalog";
import { formatPriceCents } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProductImage } from "@/components/shared/product-image";

export const revalidate = 60;

export const metadata = {
  title: "Shop | The Sweet Shop",
  description: "Browse curated snack boxes, Build-a-Box, and individual snacks from The Sweet Shop.",
};

interface ShopPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ShopHome({ searchParams }: ShopPageProps) {
  const rawParams = await searchParams;
  const query = catalogQuerySchema.parse({
    category: typeof rawParams.category === "string" ? rawParams.category : undefined,
    tag: typeof rawParams.tag === "string" ? rawParams.tag : undefined,
    q: typeof rawParams.q === "string" ? rawParams.q : undefined,
  });

  let boxes: Awaited<ReturnType<typeof getActiveBoxes>> = [];
  let snacks: Awaited<ReturnType<typeof getSellableSnacks>> = [];

  if (query.q) {
    const results = await searchCatalog(query.q);
    boxes = (results.boxes ?? []) as typeof boxes;
    snacks = (results.snacks ?? []) as typeof snacks;
  } else {
    // Milestone 18: this page is now the catch-all "browse/search
    // everything" fallback, not the primary shop entry point - each box
    // category (Snack Boxes, Candy Boxes, Mystery Box, Build-a-Box) and
    // Merchandise now has its own dedicated page/tile off the homepage,
    // reachable from SiteHeader everywhere. The category-pill filter UI
    // that used to live here is gone for that reason (a direct
    // /shop?category=... link still narrows the snacks grid below, kept
    // working for any old bookmarks/links, just with no visible pill nav).
    [boxes, snacks] = await Promise.all([
      getActiveBoxes(),
      getSellableSnacks({ category: query.category, tag: query.tag }),
    ]);
  }

  const noResults = boxes.length === 0 && snacks.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold">Shop</h1>
      <p className="mt-1 text-muted-foreground">
        Search or browse everything at once — or pick a specific category from the menu above.
      </p>

      <form className="mt-6 flex flex-wrap items-center gap-2" role="search">
        <input
          type="search"
          name="q"
          defaultValue={query.q ?? ""}
          placeholder="Search the catalog..."
          className="h-9 w-full max-w-sm rounded-lg border border-input bg-background px-3 text-sm sm:w-64"
          aria-label="Search catalog"
        />
      </form>

      {noResults ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center text-muted-foreground">
          <PackageSearch className="size-10" aria-hidden="true" />
          <p>No products match your search or filter.</p>
          <Link href="/shop" className="text-primary underline underline-offset-4">
            Clear filters
          </Link>
        </div>
      ) : (
        <>
          {boxes.length > 0 && (
            <section className="mt-8">
              <h2 className="font-heading text-lg font-medium">Boxes</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            </section>
          )}

          {snacks.length > 0 && (
            <section className="mt-8">
              <h2 className="font-heading text-lg font-medium">Snacks</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
            </section>
          )}
        </>
      )}
    </div>
  );
}
