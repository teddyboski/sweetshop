import { z } from "zod";

const SNACK_TYPES = ["chips", "candy", "cookies", "cakes", "crackers", "nuts", "gummies", "chocolate"] as const;
const FLAVORS = ["sweet", "salty", "spicy", "sour", "savory", "fruity", "chocolatey"] as const;

const buildABoxItemSchema = z.object({
  itemType: z.literal("build_a_box"),
  boxSlug: z.string().trim().min(1),
  preferences: z.object({
    snackTypes: z.array(z.enum(SNACK_TYPES)).min(1, "Select at least one snack type"),
    flavors: z.array(z.enum(FLAVORS)).min(1, "Select at least one flavor preference"),
  }),
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
export type SnackType = typeof SNACK_TYPES[number];
export type Flavor = typeof FLAVORS[number];
export { SNACK_TYPES, FLAVORS };
