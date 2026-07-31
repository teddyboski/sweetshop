import { z } from "zod";

// Admin data management only - checkout-time usage_limit/expires_at
// enforcement is explicitly Milestone 9's job (Ground Truth in the
// Milestone 8 plan doc). used_count is never client-settable - it's only
// ever moved by increment logic, not this CRUD surface.
export const createPromotionSchema = z.object({
  code: z.string().trim().min(1).toUpperCase(),
  discountType: z.enum(["percent", "fixed"]),
  value: z.number().positive(),
  usageLimit: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const updatePromotionSchema = z.object({
  discountType: z.enum(["percent", "fixed"]).optional(),
  value: z.number().positive().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;

// units_sold is never client-settable here either - increment_drop_units_sold
// (Milestone 6) is the only writer, at checkout time.
export const createDropSchema = z
  .object({
    boxId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    quantityLimit: z.number().int().positive(),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export const updateDropSchema = z.object({
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  quantityLimit: z.number().int().positive().optional(),
});

export type CreateDropInput = z.infer<typeof createDropSchema>;
export type UpdateDropInput = z.infer<typeof updateDropSchema>;
