import { authenticatedFetch } from "./authenticated-fetch";

/**
 * Milestone 12: typed client for the new /api/catalog/* routes (see that
 * milestone's plan - these are thin, rate-limited, public-read wrappers
 * around the same query layer the web shop pages already use). Every
 * response follows the project-wide { data, error } envelope
 * (CLAUDE.md's Coding Standards) - unwrapEnvelope() throws on error so
 * TanStack Query's own error state does the rest, no per-call try/catch
 * needed at the call site.
 */

export interface CatalogBox {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  price_cents: number;
  is_subscription: boolean;
  cadence: string | null;
  box_type: "curated" | "mystery" | "build_a_box";
  slot_count: number | null;
  imageUrl: string | null;
}

export interface CatalogBoxDetail extends CatalogBox {
  items: Array<{ quantity: number; snacks: { id: string; slug: string; name: string } | null }>;
}

export interface CatalogSnack {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  tags: string[] | null;
  price_cents: number | null;
  is_sellable_individually: boolean;
  imageUrl: string | null;
}

export interface CatalogDrop {
  id: string;
  box_id: string;
  starts_at: string;
  ends_at: string;
  quantity_limit: number;
  units_sold: number;
  box: { slug: string; title: string; price_cents: number; imageUrl: string | null };
}

export interface ByoSnack {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  tags: string[] | null;
  price_cents: number | null;
}

export interface SearchResults {
  boxes: Array<Pick<CatalogBox, "id" | "slug" | "title" | "price_cents" | "imageUrl">>;
  snacks: Array<Pick<CatalogSnack, "id" | "slug" | "name" | "price_cents" | "imageUrl">>;
}

interface Envelope<T> {
  data: T | null;
  error: { message: string } | null;
}

async function unwrapEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? `Request failed with status ${response.status}`);
  }
  return body.data as T;
}

export async function fetchBoxes(): Promise<CatalogBox[]> {
  const response = await authenticatedFetch("/api/catalog/boxes");
  return unwrapEnvelope<CatalogBox[]>(response);
}

export async function fetchBoxBySlug(slug: string): Promise<CatalogBoxDetail> {
  const response = await authenticatedFetch(`/api/catalog/boxes/${encodeURIComponent(slug)}`);
  return unwrapEnvelope<CatalogBoxDetail>(response);
}

export async function fetchSnacks(filters: { category?: string; tag?: string } = {}): Promise<CatalogSnack[]> {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.tag) params.set("tag", filters.tag);
  const qs = params.toString();
  const response = await authenticatedFetch(`/api/catalog/snacks${qs ? `?${qs}` : ""}`);
  return unwrapEnvelope<CatalogSnack[]>(response);
}

export async function fetchSnackBySlug(slug: string): Promise<CatalogSnack> {
  const response = await authenticatedFetch(`/api/catalog/snacks/${encodeURIComponent(slug)}`);
  return unwrapEnvelope<CatalogSnack>(response);
}

export async function searchCatalog(query: string): Promise<SearchResults> {
  const response = await authenticatedFetch(`/api/catalog/search?q=${encodeURIComponent(query)}`);
  return unwrapEnvelope<SearchResults>(response);
}

export async function fetchActiveDrops(): Promise<CatalogDrop[]> {
  const response = await authenticatedFetch("/api/catalog/drops");
  return unwrapEnvelope<CatalogDrop[]>(response);
}

export async function fetchByoSnacks(): Promise<ByoSnack[]> {
  const response = await authenticatedFetch("/api/catalog/byo-snacks");
  return unwrapEnvelope<ByoSnack[]>(response);
}
