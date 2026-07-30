import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatPriceCents } from "@/lib/utils";
import { BoxForm } from "@/components/features/admin/box-form";

export const dynamic = "force-dynamic";

export default async function AdminBoxesPage() {
  const admin = createAdminSupabaseClient();
  const { data: boxes } = await admin
    .from("boxes")
    .select("id, slug, title, price_cents, status, is_subscription")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Boxes</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="font-heading text-lg font-semibold">All boxes</h2>
          <div className="mt-2 divide-y rounded-lg border">
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
