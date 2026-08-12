import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";
import { InventoryAdjustForm } from "@/components/features/admin/inventory-adjust-form";
import { SnackStatusToggle } from "@/components/features/admin/snack-status-toggle";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const admin = createAdminSupabaseClient();
  const { data: inventory } = await admin
    .from("inventory")
    .select("snack_id, quantity_on_hand, snacks(name, status)")
    .order("quantity_on_hand", { ascending: true });

  const { data: events } = await admin
    .from("inventory_events")
    .select("id, snack_id, delta, reason, created_at, snacks(name)")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">Inventory</h1>

      <h2 className="mt-6 font-heading text-lg font-semibold">Stock levels</h2>
      <div className="mt-2 divide-y rounded-lg border">
        {(inventory ?? []).map((row) => (
          <div
            key={row.snack_id}
            data-testid={`inventory-row-${row.snack_id}`}
            className="flex items-center justify-between gap-4 p-4 text-sm"
          >
            <div className="flex-1">
              <p className="font-medium">
                {row.snacks?.name}
                {row.snacks?.status === "archived" && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                    Archived
                  </span>
                )}
              </p>
              <p className={row.quantity_on_hand < 10 ? "text-destructive" : "text-muted-foreground"}>
                {row.quantity_on_hand} on hand
              </p>
            </div>
            <InventoryAdjustForm snackId={row.snack_id} quantityOnHand={row.quantity_on_hand} />
            <SnackStatusToggle snackId={row.snack_id} status={row.snacks?.status ?? "active"} />
          </div>
        ))}
      </div>

      <h2 className="mt-8 font-heading text-lg font-semibold">Adjustment log</h2>
      <div className="mt-2 divide-y rounded-lg border">
        {(events ?? []).map((event) => (
          <div key={event.id} className="flex items-center justify-between p-4 text-sm">
            <div>
              <p className="font-medium">{event.snacks?.name}</p>
              <p className="text-muted-foreground">
                {event.reason} - {formatDate(event.created_at)}
              </p>
            </div>
            <span className={event.delta >= 0 ? "font-medium text-primary" : "font-medium text-destructive"}>
              {event.delta >= 0 ? "+" : ""}
              {event.delta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
