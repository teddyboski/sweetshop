import { z } from "zod";

const BOX_TYPES = ["curated", "build_a_box", "mystery"] as const;
const BOX_STATUSES = ["draft", "active", "archived"] as const;
const SNACK_STATUSES = ["active", "archived"] as const;
// Milestone 18: which dedicated storefront page/nav destination a box
// belongs on - orthogonal to boxType (see the box_category migration's
// comment). Nullable/optional since it starts unset on every box; Ted
// tags boxes with these from the admin as he creates the actual category
// shells (his own data-entry task, not backfilled by any migration).
const BOX_CATEGORIES = ["snack_box", "candy_box", "mystery_box", "passport_box"] as const;

// slot_count is required only when box_type = build_a_box - enforced here,
// not as a DB check constraint, per that column's own migration comment
// ("a clean cross-field conditional check is awkward in SQL").
export const createBoxSchema = z
  .object({
    slug: z.string().trim().min(1),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).nullable().optional(),
    priceCents: z.number().int().positive(),
    isSubscription: z.boolean().default(false),
    cadence: z.string().trim().min(1).nullable().optional(),
    boxType: z.enum(BOX_TYPES).default("curated"),
    category: z.enum(BOX_CATEGORIES).nullable().optional(),
    slotCount: z.number().int().positive().nullable().optional(),
    status: z.enum(BOX_STATUSES).default("draft"),
  })
  .refine((data) => (data.boxType === "build_a_box" ? typeof data.slotCount === "number" : true), {
    message: "slotCount is required when boxType is build_a_box",
    path: ["slotCount"],
  });
export type CreateBoxInput = z.infer<typeof createBoxSchema>;

// PATCH: every field optional, no defaults applied so an omitted field
// leaves the existing column value untouched - same pattern as
// updateAddressSchema (Milestone 7). No cross-field slot_count/box_type
// refinement here since a PATCH may legitimately touch only one of the two
// fields across separate requests; the create path is where that
// invariant is enforced at creation time.
export const updateBoxSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  priceCents: z.number().int().positive().optional(),
  isSubscription: z.boolean().optional(),
  cadence: z.string().trim().min(1).nullable().optional(),
  boxType: z.enum(BOX_TYPES).optional(),
  category: z.enum(BOX_CATEGORIES).nullable().optional(),
  slotCount: z.number().int().positive().nullable().optional(),
  status: z.enum(BOX_STATUSES).optional(),
});
export type UpdateBoxInput = z.infer<typeof updateBoxSchema>;

export const createSnackSchema = z.object({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  brand: z.string().trim().min(1).nullable().optional(),
  category: z.string().trim().min(1).nullable().optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  priceCents: z.number().int().positive().nullable().optional(),
  isSellableIndividually: z.boolean().default(false),
  isByoEligible: z.boolean().default(true),
  status: z.enum(SNACK_STATUSES).default("active"),
  // Creating a snack used to leave it with zero rows in `inventory` at
  // all (not even a 0) - it simply couldn't be found on the Inventory
  // page or stocked afterward, since adjust_inventory's RPC only UPDATEs
  // an existing row. Ted, 2026-08-12: "I don't see a place to put the
  // amount of this specific snack when I try to create it." Every snack
  // now gets an inventory row the moment it's created, defaulting to 0.
  initialQuantity: z.number().int().min(0).default(0),
});
export type CreateSnackInput = z.infer<typeof createSnackSchema>;

export const addBoxItemSchema = z.object({
  snackId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
});
export type AddBoxItemInput = z.infer<typeof addBoxItemSchema>;

export const updateBoxItemSchema = z.object({
  quantity: z.number().int().positive(),
});
export type UpdateBoxItemInput = z.infer<typeof updateBoxItemSchema>;

export const updateSnackSchema = z.object({
  name: z.string().trim().min(1).optional(),
  brand: z.string().trim().min(1).nullable().optional(),
  category: z.string().trim().min(1).nullable().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  priceCents: z.number().int().positive().nullable().optional(),
  isSellableIndividually: z.boolean().optional(),
  isByoEligible: z.boolean().optional(),
  status: z.enum(SNACK_STATUSES).optional(),
});
export type UpdateSnackInput = z.infer<typeof updateSnackSchema>;
