import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatPriceCents } from "@/lib/utils";
import { BoxForm } from "@/components/features/admin/box-form";

export const dynamic = "force-dynamic";

interface AdminBoxesPageProps {
  searchParams: Promise<{ showArchived?: string }>;
}

// Same hide-archived-by-default treatment as Admin -> Snacks (2026-08-12) -
// archived boxes stay in the database, just out of the way by default.
export default async function AdminBoxesPage({ searchParams }: AdminBoxesPageProps) {
  const { showArchived } = await searchParams;
  const includeArchived = showArchived === "1";

  const admin = createAdminSupabaseClient();
  let query = admin
    .from("boxes")
    .select("id, slug, title, price_cents, status, is_subscription")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (!includeArchived) {
    query = query.neq("status", "archived");
  }
  const { data: boxes } = await query;

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Boxes</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">All boxes</h2>
            <Link
              href={includeArchived ? "/admin/boxes" : "/admin/boxes?showArchived=1"}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {includeArchived ? "Hide archived" : "Show archived"}
            </Link>
          </div>
          <div className="mt-2 divide-y rounded-lg border">
            {(boxes ?? []).length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {includeArchived ? "No boxes yet." : "No active/draft boxes yet - create one, or show archived above."}
              </p>
            )}
            {(boxes ?? []).map((box) => (
              <Link
                key={box.id}
                href={`/admin/boxes/${box.id}`}
                className="flex items-center justify-between p-4 text-sm hover:bg-muted"
              >
                <div>
                  <p className="font-medium">{box.title}</p>
                  <p className="text-muted-foreground">
                    {box.slug} - {box.status}
                    {box.is_subscription ? " - subscription" : ""}
                  </p>
                </div>
                <span className="font-medium">{formatPriceCents(box.price_cents)}</span>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-heading text-lg font-semibold">Create a box</h2>
          <div className="mt-2 rounded-lg border p-4">
            <BoxForm />
          </div>
        </div>
      </div>
    </div>
  );
}
