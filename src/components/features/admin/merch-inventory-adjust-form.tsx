"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

export interface MerchInventoryAdjustFormProps {
  variantId: string;
  quantityOnHand: number;
}

/** Mirrors InventoryAdjustForm - "set quantity to", delta computed client-side, same relative-adjust RPC shape underneath. */
export function MerchInventoryAdjustForm({ variantId, quantityOnHand }: MerchInventoryAdjustFormProps) {
  const router = useRouter();
  const [newQuantity, setNewQuantity] = useState(String(quantityOnHand));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const target = Number(newQuantity);
    const delta = target - quantityOnHand;
    if (!Number.isInteger(target) || target < 0) {
      setError("Enter a whole number, 0 or more");
      return;
    }
    if (delta === 0) return;

    setSaving(true);
    const response = await authenticatedFetch(`/api/admin/merch-inventory/${variantId}/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta, reason: delta > 0 ? "restock" : "adjustment" }),
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
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground">Set quantity to</label>
      <Input
        type="number"
        min={0}
        value={newQuantity}
        onChange={(e) => setNewQuantity(e.target.value)}
        className="w-24"
        required
      />
      <Button type="submit" variant="outline" size="sm" disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  );
}
