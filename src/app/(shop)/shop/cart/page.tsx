import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveCartIdForPage } from "@/lib/cart/resolve-cart";
import { getCartContents } from "@/lib/supabase/queries/cart";
import { SNACK_ONLY_FREE_SHIPPING_THRESHOLD_CENTS } from "@/lib/cart/calculate-total";
import { CartLineRow } from "@/components/features/cart/cart-line-row";
import { formatPriceCents } from "@/lib/utils";

// Cart contents are per-visitor and mutate on every add/update/remove -
// never statically generated or ISR'd, unlike the catalog pages.
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const admin = createAdminSupabaseClient();
  const cartId = await resolveCartIdForPage(admin);
  const contents = cartId ? await getCartContents(cartId) : null;
  const lines = contents?.lines ?? [];

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-heading text-2xl font-semibold">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">Add a box or a few snacks to get started.</p>
        <Link href="/shop" className="mt-6 inline-block text-primary underline underline-offset-4">
          Browse the shop
        </Link>
      </div>
    );
  }

  const total = contents!.total;
  const remainingForFreeShipping = SNACK_ONLY_FREE_SHIPPING_THRESHOLD_CENTS - total.subtotalCents;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold">Your Cart</h1>

      <div className="mt-6 divide-y">
        {lines.map((line) => (
          <CartLineRow key={line.id} line={line} />
        ))}
      </div>

      <div className="mt-6 space-y-1 rounded-lg border p-4">
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span data-testid="cart-subtotal">{formatPriceCents(total.subtotalCents)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Shipping</span>
          <span data-testid="cart-shipping">
            {total.shippingCents === 0 ? "Free" : formatPriceCents(total.shippingCents)}
          </span>
        </div>
        {!total.hasBox && total.shippingCents > 0 && (
          <p className="text-xs text-muted-foreground">
            Add {formatPriceCents(remainingForFreeShipping)} more, or add any box, for free shipping.
          </p>
        )}
        <div className="flex justify-between border-t pt-2 font-medium">
          <span>Total</span>
          <span data-testid="cart-total">{formatPriceCents(total.totalCents)}</span>
        </div>
      </div>
    </div>
  );
}
