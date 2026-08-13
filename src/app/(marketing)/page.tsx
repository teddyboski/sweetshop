import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Boxes, Candy, HelpCircle, Blocks, Shirt, Gift, Share2, type LucideIcon } from "lucide-react";
import { SHOP_CATEGORY_LINKS } from "@/lib/shop-nav";

export const metadata: Metadata = {
  title: "The Sweet Shop | Hand-Packed Snack Boxes, Build-Your-Own & Subscriptions",
  description:
    "Curated snack boxes, build-your-own boxes, mystery drops, and a monthly subscription — hand-packed fresh to order and shipped fast.",
};

// Milestone 18: homepage is now "featured/hero + links" (Ted's own words
// when asked) rather than a single CTA - each tile is a plain Link to its
// own dedicated page, no client-side tab state, matching the rest of the
// app's Server Component-first approach. Icon + one-line description per
// SHOP_CATEGORY_LINKS entry (that shared list only carries label/href, so
// the mapping lives here where the icons/descriptions actually belong).
const TILE_DETAILS: Record<string, { icon: LucideIcon; description: string }> = {
  "/shop/snack-boxes": { icon: Boxes, description: "Hand-packed boxes of chips, cookies & more" },
  "/shop/candy-boxes": { icon: Candy, description: "A curated mix of candy in one box" },
  "/shop/mystery-box": { icon: HelpCircle, description: "Surprise contents, rotating regularly" },
  "/shop/build-a-box": { icon: Blocks, description: "Pick a size, then choose your own snacks" },
  "/shop/merch": { icon: Shirt, description: "Apparel & goods, made in-house" },
  "/account/rewards": { icon: Gift, description: "Track points and redeem perks" },
  "/account/referrals": { icon: Share2, description: "Give a friend a discount, get one back" },
};

export default function Home() {
  return (
    <main>
      <section className="relative overflow-hidden">
        <div className="relative h-64 w-full sm:h-80 md:h-96">
          <Image
            src="/hero-storefront.jpg"
            alt="Illustration of The Sweet Shop storefront, since 1928"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        </div>
        <div className="absolute inset-x-0 bottom-0 px-4 pb-6 sm:pb-8">
          <div className="mx-auto max-w-6xl">
            <h1 className="text-3xl font-bold text-white drop-shadow sm:text-4xl">Snacks that hit different.</h1>
            <p className="mt-2 max-w-2xl text-white/90 drop-shadow">
              Hand-packed, shipped fast, and never boring — pick your box below.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="font-heading text-lg font-medium">Pick your box</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {SHOP_CATEGORY_LINKS.map((link) => {
            const details = TILE_DETAILS[link.href];
            const Icon = details.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-muted"
              >
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <span className="font-medium">{link.label}</span>
                <span className="text-sm text-muted-foreground">{details.description}</span>
              </Link>
            );
          })}
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
      </section>
    </main>
  );
}
