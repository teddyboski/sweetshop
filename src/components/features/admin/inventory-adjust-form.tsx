"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

export interface InventoryAdjustFormProps {
  snackId: string;
}

export function InventoryAdjustForm({ snackId }: InventoryAdjustFormProps) {
  const router = useRouter();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<"restock" | "adjustment">("restock");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const response = await authenticatedFetch(`/api/admin/inventory/${snackId}/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta: Number(delta), reason }),
    });
    const body = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(body.error ?? "Adjustment failed");
      return;
    }

    setDelta("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as "restock" | "adjustment")}
        className="rounded-md border p-1.5 text-sm"
      >
        <option value="restock">Restock</option>
        <option value="adjustment">Adjustment</option>
      </select>
      <Input
        type="number"
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        placeholder="+/- qty"
        className="w-24"
        required
      />
      <Button type="submit" variant="outline" size="sm" disabled={saving}>
        {saving ? "..." : "Apply"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  );
}
