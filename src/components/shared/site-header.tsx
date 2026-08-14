import Image from "next/image";
import Link from "next/link";
import { AuthNavLink } from "@/components/shared/auth-nav-link";
import { SHOP_CATEGORY_LINKS } from "@/lib/shop-nav";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo-mark.png" alt="" width={32} height={32} className="h-8 w-8" priority />
          <span className="text-lg font-semibold text-primary">The Sweet Shop</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {/* Milestone 18: every category page reachable from anywhere,
              not just the homepage tiles. "Shop" stays as the catch-all
              search/browse-everything page. */}
          <Link href="/shop" className="text-muted-foreground hover:text-foreground">
            Shop
          </Link>
          {SHOP_CATEGORY_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
          <Link href="/about" className="text-muted-foreground hover:text-foreground">
            About
          </Link>
          <Link href="/faq" className="text-muted-foreground hover:text-foreground">
            FAQ
          </Link>
          <AuthNavLink />
        </nav>
      </div>
    </header>
  );
}
