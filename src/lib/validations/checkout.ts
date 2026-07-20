import { z } from "zod";

/**
 * guestEmail is only required when the request carries no bearer token
 * (see resolveExistingCartId's auth pattern) - enforced in the Route
 * Handler, not here, since Zod alone can't see the Authorization header.
 */
export const createCheckoutSessionSchema = z.object({
  guestEmail: z.string().trim().email().optional(),
});
export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;
