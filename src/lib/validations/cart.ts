import { z } from "zod";

export const addBuildABoxToCartSchema = z.object({
  boxSlug: z.string().trim().min(1),
  snacks: z
    .array(
      z.object({
        snackId: z.string().uuid(),
        quantity: z.number().int().min(1),
      })
    )
    .min(1)
    .refine(
      (snacks) => new Set(snacks.map((s) => s.snackId)).size === snacks.length,
      { message: "Duplicate snackId entries are not allowed - combine into one quantity instead" }
    ),
});
export type AddBuildABoxToCartInput = z.infer<typeof addBuildABoxToCartSchema>;
