import { SiteHeader } from "@/components/shared/site-header";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        <aside className="w-48 shrink-0 text-sm text-muted-foreground">
          Account Sidebar Placeholder
        </aside>
        <main className="flex-1">{children}</main>
      </div>
    </>
  );
}
