import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";
import { PromotionForm } from "@/components/features/admin/promotion-form";

export const dynamic = "force-dynamic";

export default async function AdminPromotionsPage() {
  const admin = createAdminSupabaseClient();
  const { data: promotions } = await admin
    .from("promotions")
    .select("id, code, discount_type, value, usage_limit, used_count, expires_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Promotions</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="font-heading text-lg font-semibold">All promotions</h2>
          <div className="mt-2 divide-y rounded-lg border">
            {(promotions ?? []).map((promo) => (
              <Link
                key={promo.id}
                href={`/admin/promotions/${promo.id}`}
                className="flex items-center justify-between p-4 text-sm hover:bg-muted"
              >
                <div>
                  <p className="font-medium">{promo.code}</p>
                  <p className="text-muted-foreground">
                    {promo.discount_type === "percent" ? `${promo.value}%` : `$${(promo.value / 100).toFixed(2)}`} off -
                    used {promo.used_count}
                    {promo.usage_limit ? `/${promo.usage_limit}` : ""}
                    {promo.expires_at ? ` - expires ${formatDate(promo.expires_at)}` : ""}
                  </p>
                </div>
              </Link>
            ))}
            {(promotions ?? []).length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No promotions yet.</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="font-heading text-lg font-semibold">Create a promotion</h2>
          <div className="mt-2 rounded-lg border p-4">
            <PromotionForm />
          </div>
        </div>
      </div>
    </div>
  );
}
