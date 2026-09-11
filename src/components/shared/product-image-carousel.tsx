"use client";

import { useState } from "react";
import Image from "next/image";

interface ProductImageCarouselProps {
  imageUrls: string[];
  alt: string;
  className?: string;
}

export function ProductImageCarousel({ imageUrls, alt, className = "" }: ProductImageCarouselProps) {
  const [current, setCurrent] = useState(0);
  const urls = imageUrls.length > 0 ? imageUrls : [];
  const total = urls.length;

  function prev() { setCurrent((c) => (c - 1 + total) % total); }
  function next() { setCurrent((c) => (c + 1) % total); }

  const currentUrl = urls[current] ?? null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
        {currentUrl ? (
          <Image
            src={currentUrl}
            alt={`${alt} photo ${current + 1}`}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 50vw"
            priority={current === 0}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No photo</div>
        )}
        {total > 1 && (
          <>
            <button type="button" onClick={prev} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow backdrop-blur hover:bg-background">
              Prev
            </button>
            <button type="button" onClick={next} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow backdrop-blur hover:bg-background">
              Next
            </button>
          </>
        )}
      </div>
      {total > 1 && (
        <div className="flex gap-2">
          {urls.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrent(i)}
              aria-label={`View photo ${i + 1}`}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${i === current ? "border-primary" : "border-transparent hover:border-muted-foreground"}`}
            >
              <Image src={url} alt={`${alt} thumbnail ${i + 1}`} fill className="object-cover" sizes="56px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}