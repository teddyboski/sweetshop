import Link from "next/link";
import { SiteHeader } from "@/components/shared/site-header";

const ACCOUNT_NAV_LINKS = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/subscriptions", label: "Subscriptions" },
  { href: "/account/preferences", label: "Preferences" },
  { href: "/account/rewards", label: "Rewards" },
  { href: "/account/referrals", label: "Referrals" },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        <aside className="w-48 shrink-0 text-sm">
          <nav className="flex flex-col gap-2">
            {ACCOUNT_NAV_LINKS.map((link) => (
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
