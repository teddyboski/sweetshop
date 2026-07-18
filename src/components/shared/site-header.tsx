import Link from "next/link";
import { AuthNavLink } from "@/components/shared/auth-nav-link";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold">
          Sweet Shop
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/shop">Shop</Link>
          <Link href="/about">About</Link>
          <Link href="/faq">FAQ</Link>
          <AuthNavLink />
        </nav>
      </div>
    </header>
  );
}
