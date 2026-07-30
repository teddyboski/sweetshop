import { z } from "zod";

// Whole-form save (not a partial PATCH) - the /account/preferences page
// submits every field each time, matching the plan's "form for
// customer_preferences fields" description. Defaults mirror the migration's
// own column defaults so an unfilled field never sends `undefined` into a
// not-null column.
export const updatePreferencesSchema = z.object({
  dietaryRestrictions: z.array(z.string().trim().min(1)).default([]),
  dislikedCategories: z.array(z.string().trim().min(1)).default([]),
  flavorProfile: z.array(z.string().trim().min(1)).default([]),
  spiceTolerance: z.string().trim().min(1).nullable().default(null),
  marketingOptIn: z.boolean().default(true),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

const addressFieldsSchema = {
  label: z.string().trim().min(1).nullable().optional(),
  recipientName: z.string().trim().min(1),
  line1: z.string().trim().min(1),
  line2: z.string().trim().min(1).nullable().optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  postalCode: z.string().trim().min(1),
  country: z.string().trim().length(2).default("US"),
  isDefault: z.boolean().default(false),
};

export const createAddressSchema = z.object(addressFieldsSchema);
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

// PATCH allows editing a subset of fields (e.g. just flipping isDefault) -
// every field optional, no defaults applied so an omitted field leaves the
// existing column value untouched.
export const updateAddressSchema = z.object({
  label: z.string().trim().min(1).nullable().optional(),
  recipientName: z.string().trim().min(1).optional(),
  line1: z.string().trim().min(1).optional(),
  line2: z.string().trim().min(1).nullable().optional(),
  city: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  postalCode: z.string().trim().min(1).optional(),
  country: z.string().trim().length(2).optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
