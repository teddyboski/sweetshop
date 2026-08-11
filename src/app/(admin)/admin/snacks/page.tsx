import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { SnackForm } from "@/components/features/admin/snack-form";

export const dynamic = "force-dynamic";

export default async function AdminSnacksPage() {
  const admin = createAdminSupabaseClient();
  const { data: snacks } = await admin
    .from("snacks")
    .select("id, slug, name, category, is_sellable_individually, is_byo_eligible, status")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Snacks</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="font-heading text-lg font-semibold">All snacks</h2>
          <div className="mt-2 divide-y rounded-lg border">
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
