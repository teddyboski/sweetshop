import Link from "next/link";
import { SiteHeader } from "@/components/shared/site-header";

const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/boxes", label: "Boxes" },
  { href: "/admin/snacks", label: "Snacks" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/rewards", label: "Rewards" },
  { href: "/admin/referrals", label: "Referrals" },
  { href: "/admin/promotions", label: "Promotions" },
  { href: "/admin/drops", label: "Drops" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {/* Ted, 2026-08-12: "it's stretched out like it's a desktop page" -
          this had no responsive breakpoints at all, so the fixed w-48 nav
          sidebar always rendered side-by-side with content even on a
          390px phone screen. Below md it's now a horizontally-scrollable
          tab row above stacked full-width content; the side-by-side
          layout only kicks in at md and up. */}
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:gap-8 md:py-8">
        <aside className="w-full shrink-0 text-sm md:w-48">
          <nav className="flex gap-4 overflow-x-auto pb-2 md:flex-col md:gap-2 md:overflow-visible md:pb-0">
            {ADMIN_NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
