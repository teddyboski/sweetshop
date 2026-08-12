"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

export interface SnackStatusToggleProps {
  snackId: string;
  status: string;
}

/**
 * Placed directly on the Inventory page (not just buried in the Snacks edit
 * form) because that's literally where Ted tried and failed to do this,
 * 2026-08-11 - "I could not remove products that I don't have." Archiving
 * (not deleting) a snack hides it from every customer-facing surface
 * (queries/catalog.ts's status='active' filters) while existing
 * order_items/cart_item_snacks rows referencing it keep working untouched -
 * same reasoning as the rest of this schema's soft-delete convention.
 */
export function SnackStatusToggle({ snackId, status }: SnackStatusToggleProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isArchived = status === "archived";

  async function toggle() {
    setError(null);
    setSaving(true);
    const response = await authenticatedFetch(`/api/admin/snacks/${snackId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: isArchived ? "active" : "archived" }),
    });
    const body = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(body.error ?? "Update failed");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={toggle}>
        {saving ? "..." : isArchived ? "Restore" : "Remove from store"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
