import Image from "next/image";
import Link from "next/link";
import { AuthNavLink } from "@/components/shared/auth-nav-link";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo-mark.svg" alt="" width={32} height={32} className="h-8 w-8" priority />
          <span className="text-lg font-semibold text-primary">The Sweet Shop</span>
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
