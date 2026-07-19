import Image from "next/image";
import { ImageOff } from "lucide-react";

export interface ProductImageProps {
  imageUrl: string | null | undefined;
  alt: string;
  className?: string;
}

/**
 * No real product photography exists yet (see Milestone 3 plan, Product
 * Decision #2) - every seeded box/snack currently has zero product_images
 * rows. Rather than fabricate placeholder URLs, this renders a defined
 * empty state until Milestone 8's admin upload (or a manual pre-launch
 * pass) adds real images.
 */
export function ProductImage({ imageUrl, alt, className }: ProductImageProps) {
  if (!imageUrl) {
    return (
      <div
        className={`flex aspect-square items-center justify-center bg-muted text-muted-foreground ${className ?? ""}`}
        role="img"
        aria-label={alt || "No image available"}
      >
        <ImageOff className="size-8" aria-hidden="true" />
      </div>
    );
  }

  return (
    <Image
      src={imageUrl}
      alt={alt}
      width={400}
      height={400}
      className={`aspect-square object-cover ${className ?? ""}`}
    />
  );
}
