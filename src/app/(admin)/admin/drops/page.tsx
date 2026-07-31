import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";
import { DropForm } from "@/components/features/admin/drop-form";

export const dynamic = "force-dynamic";

export default async function AdminDropsPage() {
  const admin = createAdminSupabaseClient();
  const { data: drops } = await admin
    .from("drops")
    .select("id, box_id, starts_at, ends_at, quantity_limit, units_sold, boxes(title)")
    .order("starts_at", { ascending: false });

  const { data: boxes } = await admin
    .from("boxes")
    .select("id, title")
    .is("deleted_at", null)
    .order("title", { ascending: true });

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Drops</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="font-heading text-lg font-semibold">All drops</h2>
          <div className="mt-2 divide-y rounded-lg border">
            {(drops ?? []).map((drop) => (
              <Link
                key={drop.id}
                href={`/admin/drops/${drop.id}`}
                className="flex items-center justify-between p-4 text-sm hover:bg-muted"
              >
                <div>
                  <p className="font-medium">{drop.boxes?.title}</p>
                  <p className="text-muted-foreground">
                    {formatDate(drop.starts_at)} - {formatDate(drop.ends_at)}
                  </p>
                </div>
                <span className="font-medium">
                  {drop.units_sold}/{drop.quantity_limit}
                </span>
              </Link>
            ))}
            {(drops ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">No drops yet.</p>}
          </div>
        </div>

        <div>
          <h2 className="font-heading text-lg font-semibold">Create a drop</h2>
          <div className="mt-2 rounded-lg border p-4">
            <DropForm boxes={boxes ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}
