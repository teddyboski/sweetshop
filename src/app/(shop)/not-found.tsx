import Link from "next/link";
import { PackageX } from "lucide-react";

export default function ShopNotFound() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-24 text-center">
      <PackageX className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="font-heading text-xl font-semibold">We couldn&apos;t find that product</h1>
      <p className="text-muted-foreground">It may have sold out, been renamed, or never existed.</p>
      <Link href="/shop" className="text-primary underline underline-offset-4">
        Back to the shop
      </Link>
    </div>
  );
}
