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

// Only merchVariantId is submitted (not merchItemId) - the variant is what
// the customer actually picked (a size/color), and it always resolves back
// to its own parent merch_item_id server-side, same trust model as every
// other item type here (never derive product identity from more client
// input than the one id needed to look it up).
const merchItemSchema = z.object({
  itemType: z.literal("merch"),
  merchVariantId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

export const addToCartSchema = z.discriminatedUnion("itemType", [
  buildABoxItemSchema,
  boxItemSchema,
  snackItemSchema,
  merchItemSchema,
]);
export type AddToCartInput = z.infer<typeof addToCartSchema>;

/** @deprecated kept as a type alias for the Milestone 4 shape; use addToCartSchema */
export const addBuildABoxToCartSchema = buildABoxItemSchema;
export type AddBuildABoxToCartInput = z.infer<typeof buildABoxItemSchema>;
