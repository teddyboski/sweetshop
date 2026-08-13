import { z } from "zod";

const MERCH_STATUSES = ["draft", "active", "archived"] as const;
const MERCH_VARIANT_STATUSES = ["active", "archived"] as const;

export const createMerchItemSchema = z.object({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  category: z.string().trim().min(1).nullable().optional(),
  priceCents: z.number().int().positive(),
  status: z.enum(MERCH_STATUSES).default("draft"),
});
export type CreateMerchItemInput = z.infer<typeof createMerchItemSchema>;

// PATCH: every field optional, no defaults applied, so an omitted field
// leaves the existing column value untouched - same pattern as
// updateSnackSchema/updateBoxSchema.
export const updateMerchItemSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  category: z.string().trim().min(1).nullable().optional(),
  priceCents: z.number().int().positive().optional(),
  status: z.enum(MERCH_STATUSES).optional(),
});
export type UpdateMerchItemInput = z.infer<typeof updateMerchItemSchema>;

export const createMerchVariantSchema = z.object({
  size: z.string().trim().min(1).nullable().optional(),
  color: z.string().trim().min(1).nullable().optional(),
  sku: z.string().trim().min(1).nullable().optional(),
  priceCentsOverride: z.number().int().positive().nullable().optional(),
  // Same "no place to put initial stock" gap Ted flagged for snacks
  // (2026-08-12) - a merch variant gets an inventory row the moment it's
  // created, defaulting to 0, rather than being unstockable until someone
  // visits Inventory afterward.
  initialQuantity: z.number().int().min(0).default(0),
});
export type CreateMerchVariantInput = z.infer<typeof createMerchVariantSchema>;

// status is how a variant is "removed" - this app never hard-deletes a
// catalog row that could have order/inventory history against it (see the
// merch_variants migration's own comment). The admin UI's "Archive" action
// is just this PATCH with status: "archived".
export const updateMerchVariantSchema = z.object({
  size: z.string().trim().min(1).nullable().optional(),
  color: z.string().trim().min(1).nullable().optional(),
  sku: z.string().trim().min(1).nullable().optional(),
  priceCentsOverride: z.number().int().positive().nullable().optional(),
  status: z.enum(MERCH_VARIANT_STATUSES).optional(),
});
export type UpdateMerchVariantInput = z.infer<typeof updateMerchVariantSchema>;
