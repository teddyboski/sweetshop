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

const CATEGORIES = ["candy", "chips", "cookies", "spicy", "salty", "sweet", "international"];

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
    // Boxes have no category/tag column - only snacks are filterable that way.
    // A category/tag filter narrows the snacks grid; boxes always show in full.
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
        Curated snack boxes, Build-a-Box, and individual snacks — contents on mystery boxes rotate weekly.
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

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Filter by category">
        {CATEGORIES.map((category) => (
          <Link
            key={category}
            href={query.category === category ? "/shop" : `/shop?category=${category}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
              query.category === category
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            {category}
          </Link>
        ))}
      </nav>

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
                      <ProductImage imageUrl={null} alt={box.title} />
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
                      <ProductImage imageUrl={null} alt={snack.name} />
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
