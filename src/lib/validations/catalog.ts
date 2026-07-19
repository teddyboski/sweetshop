import { z } from "zod";

export const catalogQuerySchema = z.object({
  category: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
