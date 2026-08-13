"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

export interface MerchVariantRow {
  id: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  priceCentsOverride: number | null;
  status: "active" | "archived";
  quantityOnHand: number;
}

export interface MerchVariantsEditorProps {
  merchItemId: string;
  variants: MerchVariantRow[];
}

/**
 * Modeled directly on BoxItemsEditor, with two differences that follow from
 * merch_variants being a real catalog identity (order_items can reference
 * it permanently) rather than a composition template like box_items:
 * "Remove" archives (PATCH status: "archived") instead of hard-deleting,
 * and each row carries its own price override + starting stock instead of
 * just a quantity.
 */
export function MerchVariantsEditor({ merchItemId, variants }: MerchVariantsEditorProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [sku, setSku] = useState("");
  const [priceOverrideDollars, setPriceOverrideDollars] = useState("");
  const [initialQuantity, setInitialQuantity] = useState("0");
  const [adding, setAdding] = useState(false);

  const visibleVariants = showArchived ? variants : variants.filter((v) => v.status === "active");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const quantity = Number(initialQuantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("Starting stock must be a whole number, 0 or more");
      return;
    }

    setAdding(true);
    const response = await authenticatedFetch(`/api/admin/merch/${merchItemId}/variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        size: size || null,
        color: color || null,
        sku: sku || null,
        priceCentsOverride: priceOverrideDollars ? Math.round(Number(priceOverrideDollars) * 100) : null,
        initialQuantity: quantity,
      }),
    });
    const body = await response.json();
    setAdding(false);

    if (!response.ok) {
      setError(body.error ?? "Add failed");
      return;
    }

    setSize("");
    setColor("");
    setSku("");
    setPriceOverrideDollars("");
    setInitialQuantity("0");
    router.refresh();
  }

  async function handleArchive(variantId: string, nextStatus: "active" | "archived") {
    setError(null);
    setBusyId(variantId);
    const response = await authenticatedFetch(`/api/admin/merch/${merchItemId}/variants/${variantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setBusyId(null);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Update failed");
      return;
    }
    router.refresh();
  }

  function formatVariantLabel(variant: MerchVariantRow) {
    return [variant.size, variant.color].filter(Boolean).join(" / ") || variant.sku || "Default";
  }

  return (
    <div className="mt-6 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">Variants &amp; stock</h2>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Every item needs at least one variant, even if it&apos;s just a single size/color. Adjust stock afterward
        from Admin → Inventory.
      </p>

      {visibleVariants.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No variants yet - add one below.</p>
      ) : (
        <div className="mt-4 divide-y rounded-md border">
          {visibleVariants.map((variant) => (
            <div key={variant.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="flex-1">
                <p className="font-medium">
                  {formatVariantLabel(variant)}
                  {variant.status === "archived" && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                      Archived
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {variant.sku ? `SKU ${variant.sku} · ` : ""}
                  {variant.priceCentsOverride !== null
                    ? `$${(variant.priceCentsOverride / 100).toFixed(2)} override · `
                    : ""}
                  {variant.quantityOnHand} in stock
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busyId === variant.id}
                onClick={() => handleArchive(variant.id, variant.status === "active" ? "archived" : "active")}
              >
                {variant.status === "active" ? "Archive" : "Restore"}
              </Button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="variantSize" className="text-sm font-medium">Size</label>
          <Input id="variantSize" value={size} onChange={(e) => setSize(e.target.value)} className="w-24" placeholder="M" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="variantColor" className="text-sm font-medium">Color</label>
          <Input id="variantColor" value={color} onChange={(e) => setColor(e.target.value)} className="w-28" placeholder="Navy" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="variantSku" className="text-sm font-medium">SKU</label>
          <Input id="variantSku" value={sku} onChange={(e) => setSku(e.target.value)} className="w-28" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="variantPriceOverride" className="text-sm font-medium">Price override ($)</label>
          <Input
            id="variantPriceOverride"
            type="number"
            step="0.01"
            min="0"
            value={priceOverrideDollars}
            onChange={(e) => setPriceOverrideDollars(e.target.value)}
            className="w-28"
            placeholder="optional"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="variantInitialQuantity" className="text-sm font-medium">Starting stock</label>
          <Input
            id="variantInitialQuantity"
            type="number"
            min="0"
            value={initialQuantity}
            onChange={(e) => setInitialQuantity(e.target.value)}
            className="w-24"
          />
        </div>
        <Button type="submit" disabled={adding}>
          {adding ? "Adding..." : "Add variant"}
        </Button>
      </form>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
