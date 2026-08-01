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
