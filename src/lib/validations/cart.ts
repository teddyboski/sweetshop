import { z } from "zod";

const buildABoxItemSchema = z.object({
  itemType: z.literal("build_a_box"),
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

const boxItemSchema = z.object({
  itemType: z.literal("box"),
  boxSlug: z.string().trim().min(1),
  quantity: z.number().int().min(1),
});

const snackItemSchema = z.object({
  itemType: z.literal("snack"),
  snackId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

export const addToCartSchema = z.discriminatedUnion("itemType", [
  buildABoxItemSchema,
  boxItemSchema,
  snackItemSchema,
]);
export type AddToCartInput = z.infer<typeof addToCartSchema>;

/** @deprecated kept as a type alias for the Milestone 4 shape; use addToCartSchema */
export const addBuildABoxToCartSchema = buildABoxItemSchema;
export type AddBuildABoxToCartInput = z.infer<typeof buildABoxItemSchema>;
