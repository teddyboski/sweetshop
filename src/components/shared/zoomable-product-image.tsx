"use client";

import * as React from "react";
import Image from "next/image";
import { X, ZoomIn } from "lucide-react";
import { ProductImage, type ProductImageProps } from "@/components/shared/product-image";

/**
 * Milestone 23: wraps the shared ProductImage for detail-page hero images
 * only (grids already wrap ProductImage in a Link to the detail page - a
 * click-to-zoom there would fight the navigation). Tap opens a larger
 * version of the same image in an overlay; tap again, Escape, or the close
 * button dismisses it. Deliberately no pinch/pan - Ted chose the simpler,
 * ships-via-OTA option over a real pinch-zoom gesture.
 */
export function ZoomableProductImage({ imageUrl, alt, className }: ProductImageProps) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!imageUrl) {
    return <ProductImage imageUrl={imageUrl} alt={alt} className={className} />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full cursor-zoom-in text-left"
        aria-label={`View larger image of ${alt}`}
      >
        <ProductImage imageUrl={imageUrl} alt={alt} className={className} />
        <span className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 shadow transition-opacity group-hover:opacity-100">
          <ZoomIn className="size-4" aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} - enlarged`}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-background/90 text-foreground"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
          <Image
            src={imageUrl}
            alt={alt}
            width={1000}
            height={1000}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
