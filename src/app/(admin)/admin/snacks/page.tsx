import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { SnackForm } from "@/components/features/admin/snack-form";

export const dynamic = "force-dynamic";

interface AdminSnacksPageProps {
  searchParams: Promise<{ showArchived?: string }>;
}

// Archived snacks stay in the database (never hard-deleted - real order
// history could reference them, and this app never hard-deletes catalog
// rows per CLAUDE.md), but Ted, 2026-08-12: "I don't want to archive them
// because they are in the way" - hidden from this list by default now,
// with a link to reveal them, rather than mixed into the main list with
// just a badge.
export default async function AdminSnacksPage({ searchParams }: AdminSnacksPageProps) {
  const { showArchived } = await searchParams;
  const includeArchived = showArchived === "1";

  const admin = createAdminSupabaseClient();
  let query = admin
    .from("snacks")
    .select("id, slug, name, category, is_sellable_individually, is_byo_eligible, status")
    .order("created_at", { ascending: false });
  if (!includeArchived) {
    query = query.eq("status", "active");
  }
  const { data: snacks } = await query;

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Snacks</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">All snacks</h2>
            <Link
              href={includeArchived ? "/admin/snacks" : "/admin/snacks?showArchived=1"}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {includeArchived ? "Hide archived" : "Show archived"}
            </Link>
          </div>
          <div className="mt-2 divide-y rounded-lg border">
            {(snacks ?? []).length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {includeArchived ? "No snacks yet." : "No active snacks yet - add one, or show archived above."}
              </p>
            )}
            {(snacks ?? []).map((snack) => (
              <Link
                key={snack.id}
                href={`/admin/snacks/${snack.id}`}
                className="flex items-center justify-between p-4 text-sm hover:bg-muted"
              >
                <div>
                  <p className="font-medium">
                    {snack.name}
                    {snack.status === "archived" && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                        Archived
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {snack.slug}
                    {snack.category ? ` - ${snack.category}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {snack.is_sellable_individually ? <p>Sellable</p> : null}
                  {snack.is_byo_eligible ? <p>BYO-eligible</p> : null}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-heading text-lg font-semibold">Create a snack</h2>
          <div className="mt-2 rounded-lg border p-4">
            <SnackForm />
          </div>
        </div>
      </div>
    </div>
  );
}
