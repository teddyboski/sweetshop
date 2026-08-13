"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import type { Database } from "@/types/supabase";

type Snack = Database["public"]["Tables"]["snacks"]["Row"];

export interface SnackFormProps {
  snack?: Snack;
}

export function SnackForm({ snack }: SnackFormProps) {
  const router = useRouter();
  const isEditing = Boolean(snack);

  const [slug, setSlug] = useState(snack?.slug ?? "");
  const [name, setName] = useState(snack?.name ?? "");
  const [brand, setBrand] = useState(snack?.brand ?? "");
  const [category, setCategory] = useState(snack?.category ?? "");
  // Priced in dollars in the UI (e.g. "4.50"), converted to cents on
  // submit - the field used to be raw integer cents, which is how Ted hit
  // "Invalid input: expected int, received number" typing "4.50" into it.
  const [priceDollars, setPriceDollars] = useState(
    snack?.price_cents ? (snack.price_cents / 100).toFixed(2) : ""
  );
  const [initialQuantity, setInitialQuantity] = useState("0");
  const [isSellableIndividually, setIsSellableIndividually] = useState(snack?.is_sellable_individually ?? false);
  const [isByoEligible, setIsByoEligible] = useState(snack?.is_byo_eligible ?? true);
  const [status, setStatus] = useState(snack?.status ?? "active");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      ...(isEditing ? {} : { slug, initialQuantity: Number(initialQuantity) || 0 }),
      name,
      brand: brand || null,
      category: category || null,
      priceCents: priceDollars ? Math.round(Number(priceDollars) * 100) : null,
      isSellableIndividually,
      isByoEligible,
      status,
    };

    const response = await authenticatedFetch(isEditing ? `/api/admin/snacks/${snack!.id}` : "/api/admin/snacks", {
      method: isEditing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();

    if (!response.ok) {
      setSaving(false);
      setError(body.error ?? "Save failed");
      return;
    }

    const snackId = isEditing ? snack!.id : body.data.id;

    if (imageFile) {
      const formData = new FormData();
      formData.append("file", imageFile);
      formData.append("snackId", snackId);
      formData.append("isPrimary", "true");
      const uploadResponse = await authenticatedFetch("/api/admin/uploads", { method: "POST", body: formData });
      if (!uploadResponse.ok) {
        const uploadBody = await uploadResponse.json();
        setSaving(false);
        setError(uploadBody.error ?? "Image upload failed");
        return;
      }
    }

    setSaving(false);
    router.push("/admin/snacks");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {!isEditing && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="slug" className="text-sm font-medium">Slug</label>
          <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">Name</label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="status" className="text-sm font-medium">Status</label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as "active" | "archived")}
          className="rounded-md border p-2 text-sm"
        >
          <option value="active">Active - visible to customers</option>
          <option value="archived">Archived - hidden, don&apos;t carry anymore</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="brand" className="text-sm font-medium">Brand</label>
        <Input id="brand" value={brand ?? ""} onChange={(e) => setBrand(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="category" className="text-sm font-medium">Category</label>
        <Input
          id="category"
          list="snack-categories"
          value={category ?? ""}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. house_snacks, candy, chips"
        />
        {/* Suggestions only - free text still accepted, so this never blocks
            a genuinely new category. house_snacks added 2026-08-12 for
            Ted's in-house made items (trail mix, dipped cookies, loaded
            rice krispie treats), kept separate from store-bought snacks. */}
        <datalist id="snack-categories">
          <option value="house_snacks" />
          <option value="candy" />
          <option value="chips" />
          <option value="cookies" />
          <option value="spicy" />
          <option value="salty" />
          <option value="sweet" />
          <option value="international" />
        </datalist>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="priceDollars" className="text-sm font-medium">Price ($)</label>
        <Input
          id="priceDollars"
          type="number"
          step="0.01"
          min="0"
          placeholder="e.g. 4.50"
          value={priceDollars}
          onChange={(e) => setPriceDollars(e.target.value)}
        />
      </div>
      {!isEditing && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="initialQuantity" className="text-sm font-medium">Quantity in stock</label>
          <Input
            id="initialQuantity"
            type="number"
            min="0"
            value={initialQuantity}
            onChange={(e) => setInitialQuantity(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            You can adjust this any time from Admin → Inventory.
          </p>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isSellableIndividually}
          onChange={(e) => setIsSellableIndividually(e.target.checked)}
        />
        Sellable individually
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isByoEligible} onChange={(e) => setIsByoEligible(e.target.checked)} />
        Build-a-box eligible
      </label>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="image" className="text-sm font-medium">Photo (JPEG/PNG/WebP, max 5 MB)</label>
        <input
          id="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : isEditing ? "Save changes" : "Create snack"}
      </Button>
    </form>
  );
}
