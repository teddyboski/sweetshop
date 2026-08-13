"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import { formatPriceCents } from "@/lib/utils";

export interface MerchVariantOption {
  id: string;
  size: string | null;
  color: string | null;
  resolvedPriceCents: number;
}

export interface MerchVariantPickerProps {
  variants: MerchVariantOption[];
}

/**
 * Standalone rather than reusing AddToCartButton directly, since a merch
 * purchase needs a selection step (which variant) before the payload is
 * even known - AddToCartButton's payload is fixed at render time, which
 * doesn't fit here. Wraps the same POST /api/cart/items call underneath.
 */
export function MerchVariantPicker({ variants }: MerchVariantPickerProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sizes = useMemo(() => Array.from(new Set(variants.map((v) => v.size).filter(Boolean))), [variants]);
  const colors = useMemo(() => Array.from(new Set(variants.map((v) => v.color).filter(Boolean))), [variants]);
  const selectedVariant = variants.find((v) => v.id === selectedId);

  if (variants.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">Currently out of stock - check back soon.</p>;
  }

  async function handleAdd() {
    if (!selectedId) return;
    setState("submitting");
    setErrorMessage(null);

    const response = await authenticatedFetch("/api/cart/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType: "merch", merchVariantId: selectedId, quantity: 1 }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setState("error");
      setErrorMessage(body?.error?.message ?? "Could not add to cart.");
      return;
    }

    setState("success");
    router.refresh();
  }

  return (
    <div className="mt-4">
      {variants.length > 1 && (sizes.length > 0 || colors.length > 0) ? (
        <div className="flex flex-col gap-3">
          {sizes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="merch-size" className="text-sm font-medium">Size</label>
              <select
                id="merch-size"
                className="rounded-md border p-2 text-sm"
                value={variants.find((v) => v.id === selectedId)?.size ?? ""}
                onChange={(e) => {
                  const color = variants.find((v) => v.id === selectedId)?.color ?? null;
                  const match = variants.find((v) => v.size === e.target.value && v.color === color) ?? variants.find((v) => v.size === e.target.value);
                  if (match) setSelectedId(match.id);
                }}
              >
                {sizes.map((size) => (
                  <option key={size} value={size ?? ""}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          )}
          {colors.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="merch-color" className="text-sm font-medium">Color</label>
              <select
                id="merch-color"
                className="rounded-md border p-2 text-sm"
                value={variants.find((v) => v.id === selectedId)?.color ?? ""}
                onChange={(e) => {
                  const size = variants.find((v) => v.id === selectedId)?.size ?? null;
                  const match = variants.find((v) => v.color === e.target.value && v.size === size) ?? variants.find((v) => v.color === e.target.value);
                  if (match) setSelectedId(match.id);
                }}
              >
                {colors.map((color) => (
                  <option key={color} value={color ?? ""}>
                    {color}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ) : null}

      {selectedVariant && (
        <p className="mt-3 text-xl font-medium">{formatPriceCents(selectedVariant.resolvedPriceCents)}</p>
      )}

      <div className="mt-3">
        <Button size="lg" onClick={handleAdd} disabled={state === "submitting" || !selectedId}>
          {state === "submitting" ? "Adding..." : "Add to Cart"}
        </Button>
        {state === "success" && <p className="mt-2 text-sm font-medium text-primary">Added to your cart.</p>}
        {state === "error" && errorMessage && <p className="mt-2 text-sm text-destructive">{errorMessage}</p>}
      </div>
    </div>
  );
}
