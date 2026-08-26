import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { MerchForm } from "@/components/features/admin/merch-form";

export const dynamic = "force-dynamic";

interface AdminMerchPageProps {
  searchParams: Promise<{ showArchived?: string }>;
}

// Mirrors admin/snacks/page.tsx: archived items stay in the database
// (never hard-deleted - real order history could reference them) but are
// hidden from this list by default, with a link to reveal them.
export default async function AdminMerchPage({ searchParams }: AdminMerchPageProps) {
  const { showArchived } = await searchParams;
  const includeArchived = showArchived === "1";

  const admin = createAdminSupabaseClient();
  let query = admin
    .from("merch_items")
    .select("id, slug, name, category, price_cents, status")
    .order("created_at", { ascending: false });
  if (!includeArchived) {
    query = query.eq("status", "active");
  }
  const { data: merchItems } = await query;

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Merchandise</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        In-house apparel and other made-to-order goods, sold alongside snack boxes in the same cart and checkout.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">All items</h2>
            <Link
              href={includeArchived ? "/admin/merch" : "/admin/merch?showArchived=1"}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {includeArchived ? "Hide archived" : "Show archived"}
            </Link>
          </div>
          <div className="mt-2 divide-y rounded-lg border">
            {(merchItems ?? []).length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {includeArchived ? "No merchandise yet." : "No active items yet - add one, or show archived above."}
              </p>
            )}
            {(merchItems ?? []).map((item) => (
              <Link
                key={item.id}
                href={`/admin/merch/${item.id}`}
                className="flex items-center justify-between p-4 text-sm hover:bg-muted"
              >
                <div>
                  <p className="font-medium">
                    {item.name}
                    {item.status !== "active" && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground capitalize">
                        {item.status}
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {item.slug}
                    {item.category ? ` - ${item.category}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  ${(item.price_cents / 100).toFixed(2)}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-heading text-lg font-semibold">Create an item</h2>
          <div className="mt-2 rounded-lg border p-4">
            <MerchForm />
          </div>
        </div>
      </div>
    </div>
  );
}
