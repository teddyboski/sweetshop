"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

export interface BoxItemRow {
  id: string;
  snackId: string;
  snackName: string;
  quantity: number;
}

export interface AvailableSnack {
  id: string;
  name: string;
}

export interface BoxItemsEditorProps {
  boxId: string;
  items: BoxItemRow[];
  availableSnacks: AvailableSnack[];
}

/**
 * Curated/mystery boxes (Snack Box, Candy Box, Mystery Box, Passport Box)
 * are entirely staff-curated - the customer never picks their contents,
 * that's what Build-a-Box is for. Until this component existed there was no
 * way to set a box's contents anywhere in the admin dashboard; it only ever
 * happened via raw SQL in the original seed migration. Ted, 2026-08-12:
 * "all of the boxes will be curated by us with no input from the customer" -
 * this is that curation screen.
 */
export function BoxItemsEditor({ boxId, items, availableSnacks }: BoxItemsEditorProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newSnackId, setNewSnackId] = useState(availableSnacks[0]?.id ?? "");
  const [newQuantity, setNewQuantity] = useState("1");
  const [adding, setAdding] = useState(false);

  const usedSnackIds = new Set(items.map((item) => item.snackId));
  const pickableSnacks = availableSnacks.filter((s) => !usedSnackIds.has(s.id));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newSnackId) return;
    const quantity = Number(newQuantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("Quantity must be a whole number, 1 or more");
      return;
    }

    setAdding(true);
    const response = await authenticatedFetch(`/api/admin/boxes/${boxId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snackId: newSnackId, quantity }),
    });
    const body = await response.json();
    setAdding(false);

    if (!response.ok) {
      setError(body.error ?? "Add failed");
      return;
    }

    setNewQuantity("1");
    router.refresh();
  }

  async function handleQuantityChange(itemId: string, quantity: number) {
    setError(null);
    if (!Number.isInteger(quantity) || quantity < 1) return;
    setBusyId(itemId);
    const response = await authenticatedFetch(`/api/admin/boxes/${boxId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    const body = await response.json();
    setBusyId(null);

    if (!response.ok) {
      setError(body.error ?? "Update failed");
      return;
    }
    router.refresh();
  }

  async function handleRemove(itemId: string) {
    setError(null);
    setBusyId(itemId);
    const response = await authenticatedFetch(`/api/admin/boxes/${boxId}/items/${itemId}`, {
      method: "DELETE",
    });
    setBusyId(null);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Remove failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-6 rounded-lg border p-4">
      <h2 className="font-heading text-lg font-semibold">Box contents</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Exactly what goes in this box for every customer. Customers don&apos;t choose these - that&apos;s
        Build-a-Box only.
      </p>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No snacks added yet - this box is empty.</p>
      ) : (
        <div className="mt-4 divide-y rounded-md border">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span className="flex-1 font-medium">{item.snackName}</span>
              <Input
                type="number"
                min={1}
                defaultValue={item.quantity}
                className="w-20"
                disabled={busyId === item.id}
                onBlur={(e) => {
                  const quantity = Number(e.target.value);
                  if (quantity !== item.quantity) handleQuantityChange(item.id, quantity);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busyId === item.id}
                onClick={() => handleRemove(item.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {pickableSnacks.length > 0 ? (
        <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-2">
          <div className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
            <label htmlFor="newSnack" className="text-sm font-medium">
              Add a snack
            </label>
            <select
              id="newSnack"
              value={newSnackId}
              onChange={(e) => setNewSnackId(e.target.value)}
              className="w-full rounded-md border p-2 text-sm"
            >
              {pickableSnacks.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="newQuantity" className="text-sm font-medium">
              Qty
            </label>
            <Input
              id="newQuantity"
              type="number"
              min={1}
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
              className="w-20"
            />
          </div>
          <Button type="submit" disabled={adding}>
            {adding ? "Adding..." : "Add"}
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Every active snack is already in this box, or there are no active snacks yet - add some via Admin →
          Snacks first.
        </p>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
