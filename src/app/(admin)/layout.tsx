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
      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        <aside className="w-48 shrink-0 text-sm">
          <nav className="flex flex-col gap-2">
            {ADMIN_NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-muted-foreground hover:text-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="flex-1">{children}</main>
      </div>
    </>
  );
}
