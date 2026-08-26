import { z } from "zod";

/**
 * guestEmail is only required when the request carries no bearer token
 * (see resolveExistingCartId's auth pattern) - enforced in the Route
 * Handler, not here, since Zod alone can't see the Authorization header.
 */
export const createCheckoutSessionSchema = z.object({
  guestEmail: z.string().trim().email().optional(),
  // Milestone 9: both optional, both re-validated in the Route Handler
  // (existence/expiry/limit for the code, actual balance for points) -
  // Zod only checks shape here.
  promoCode: z.string().trim().min(1).optional(),
  redeemPoints: z.number().int().positive().optional(),
});
export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;

/**
 * Milestone 13 (mobile): the native Payment Sheet has no hosted-page
 * equivalent to collect a shipping address the way Stripe Checkout does,
 * so the mobile app collects it in its own screen and sends it here.
 * US-only, matching the site's existing domestic-only shipping rule
 * (see checkout/session/route.ts's shipping_address_collection comment).
 */
export const shippingAddressSchema = z.object({
  name: z.string().trim().min(1).max(200),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(2).max(2),
  postalCode: z.string().trim().min(5).max(10),
});
export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;

export const createPaymentIntentSchema = z.object({
  guestEmail: z.string().trim().email().optional(),
  promoCode: z.string().trim().min(1).optional(),
  redeemPoints: z.number().int().positive().optional(),
  shippingAddress: shippingAddressSchema,
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;
