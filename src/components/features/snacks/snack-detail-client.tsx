"use client";

import { useState } from "react";
import { ProductImageCarousel } from "@/components/shared/product-image-carousel";
import { AddToCartButton } from "@/components/features/cart/add-to-cart-button";
import { formatPriceCents } from "@/lib/utils";

interface SnackVariant {
  id: string;
  size: string;
  price_cents: number;
}

interface SnackDetailClientProps {
  snack: {
    id: string;
    name: string;
    brand: string | null;
    category: string | null;
    tags: string[];
    price_cents: number | null;
    imageUrl: string | null;
    imageUrls: string[];
    variants: SnackVariant[];
  };
}

export function SnackDetailClient({ snack }: SnackDetailClientProps) {
  const hasVariants = snack.variants.length > 0;
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    hasVariants ? snack.variants[0].id : null
  );

  const selectedVariant = snack.variants.find((v) => v.id === selectedVariantId) ?? null;
  const displayPrice = selectedVariant ? selectedVariant.price_cents : snack.price_cents;

  const cartPayload = selectedVariant
    ? { itemType: "snack" as const, snackId: snack.id, snackVariantId: selectedVariant.id, quantity: 1 }
    : { itemType: "snack" as const, snackId: snack.id, quantity: 1 };

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <ProductImageCarousel imageUrls={snack.imageUrls} alt={snack.name} />
      <div>
        <h1 className="font-heading text-2xl font-semibold">{snack.name}</h1>
        {snack.brand && <p className="text-sm text-muted-foreground">{snack.brand}</p>}
        <p className="mt-2 text-xl font-medium">{formatPriceCents(displayPrice ?? 0)}</p>

        {hasVariants && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-sm font-medium">Size</p>
            <div className="flex gap-2">
              {snack.variants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setSelectedVariantId(variant.id)}
                  className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                    selectedVariantId === variant.id
                      ? "border-primary bg-primary/5 font-medium text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {variant.size}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {formatPriceCents(variant.price_cents)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {snack.category && (
          <p className="mt-4 text-sm capitalize text-muted-foreground">Category: {snack.category}</p>
        )}
        {snack.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {snack.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4">
          <AddToCartButton payload={cartPayload} />
        </div>
      </div>
    </div>
  );
}