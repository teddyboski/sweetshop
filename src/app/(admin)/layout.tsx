export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r p-4 text-sm text-muted-foreground">
        Admin Sidebar Placeholder
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
