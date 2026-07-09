import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Sweet Shop | Hand-Packed Snack Boxes, Build-Your-Own & Subscriptions",
  description:
    "Curated snack boxes, build-your-own boxes, mystery drops, and a monthly subscription — hand-packed fresh to order and shipped fast.",
};

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold">Snacks that hit different.</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Hand-packed, shipped fast, and never boring. From best-seller boxes to
        build-your-own, mystery drops to a monthly subscription — The Sweet
        Shop is snacking, leveled up.
      </p>
      <Link
        href="/shop"
        className="mt-8 inline-block rounded-md bg-primary px-6 py-3 text-primary-foreground"
      >
        Shop Boxes
      </Link>

      <div className="mt-16 rounded-lg border p-6">
        <div className="text-sm font-medium text-muted-foreground">🍿 Best Seller</div>
        <h2 className="mt-1 text-xl font-semibold">Munchie Box — $15</h2>
        <p className="mt-2 text-muted-foreground">
          The ultimate snack attack. Chips, candy, gummies &amp; a surprise
          bonus snack.
        </p>
      </div>

      <div className="mt-12 text-center">
        <p className="text-muted-foreground">
          Catch us live — new drops &amp; giveaways every week on Whatnot.
        </p>
        <a
          href="https://www.whatnot.com/user/thesweetshop"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block underline"
        >
          Follow @sweet_shop_official
        </a>
      </div>
    </main>
  );
}
