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

interface VariantDraft {
  size: "Small" | "Medium" | "Large";
  priceDollars: string;
}

const SIZE_OPTIONS = ["Small", "Medium", "Large"] as const;

export function SnackForm({ snack }: SnackFormProps) {
  const router = useRouter();
  const isEditing = Boolean(snack);

  const [slug, setSlug] = useState(snack?.slug ?? "");
  const [name, setName] = useState(snack?.name ?? "");
  const [brand, setBrand] = useState(snack?.brand ?? "");
  const [category, setCategory] = useState(snack?.category ?? "");
  const [priceDollars, setPriceDollars] = useState(snack?.price_cents ? (snack.price_cents / 100).toFixed(2) : "");
  const [initialQuantity, setInitialQuantity] = useState("0");
  const [isSellableIndividually, setIsSellableIndividually] = useState(snack?.is_sellable_individually ?? false);
  const [isByoEligible, setIsByoEligible] = useState(snack?.is_byo_eligible ?? true);
  const [status, setStatus] = useState(snack?.status ?? "active");
  const [imageFiles, setImageFiles] = useState<[File | null, File | null, File | null]>([null, null, null]);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setImageFile(index: 0 | 1 | 2, file: File | null) {
    setImageFiles((prev) => {
      const next: [File | null, File | null, File | null] = [...prev] as [File | null, File | null, File | null];
      next[index] = file;
      return next;
    });
  }

  function addVariant() {
    const used = new Set(variants.map((v) => v.size));
    const next = SIZE_OPTIONS.find((s) => !used.has(s));
    if (!next) return;
    setVariants((prev) => [...prev, { size: next, priceDollars: "" }]);
  }

  function updateVariant(index: number, field: keyof VariantDraft, value: string) {
    setVariants((prev) => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  }

  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

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

    for (let i = 0; i < 3; i++) {
      const file = imageFiles[i];
      if (!file) continue;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("snackId", snackId);
      formData.append("isPrimary", i === 0 ? "true" : "false");
      const uploadResponse = await authenticatedFetch("/api/admin/uploads", { method: "POST", body: formData });
      if (!uploadResponse.ok) {
        const uploadBody = await uploadResponse.json();
        setSaving(false);
        setError(uploadBody.error ?? "Image upload failed");
        return;
      }
    }

    for (const variant of variants) {
      if (!variant.priceDollars) continue;
      const variantResponse = await authenticatedFetch(`/api/admin/snacks/${snackId}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size: variant.size, priceCents: Math.round(Number(variant.priceDollars) * 100) }),
      });
      if (!variantResponse.ok) {
        const variantBody = await variantResponse.json();
        setSaving(false);
        setError(variantBody.error ?? "Variant creation failed");
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
        <select id="status" value={status} onChange={(e) => setStatus(e.target.value as "active" | "archived")} className="rounded-md border p-2 text-sm">
          <option value="active">Active - visible to customers</option>
          <option value="archived">Archived - hidden</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="brand" className="text-sm font-medium">Brand</label>
        <Input id="brand" value={brand ?? ""} onChange={(e) => setBrand(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="category" className="text-sm font-medium">Category</label>
        <Input id="category" list="snack-categories" value={category ?? ""} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. house_snacks, candy, chips" />
        <datalist id="snack-categories">
          <option value="house_snacks" />
          <option value="cakes" />
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
        <label htmlFor="priceDollars" className="text-sm font-medium">Base price ($) — used when no size variants exist</label>
        <Input id="priceDollars" type="number" step="0.01" min="0" placeholder="e.g. 4.50" value={priceDollars} onChange={(e) => setPriceDollars(e.target.value)} />
      </div>
      {!isEditing && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="initialQuantity" className="text-sm font-medium">Quantity in stock</label>
          <Input id="initialQuantity" type="number" min="0" value={initialQuantity} onChange={(e) => setInitialQuantity(e.target.value)} />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isSellableIndividually} onChange={(e) => setIsSellableIndividually(e.target.checked)} />
        Sellable individually
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isByoEligible} onChange={(e) => setIsByoEligible(e.target.checked)} />
        Build-a-box eligible
      </label>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Size variants</p>
          <Button type="button" variant="outline" size="sm" onClick={addVariant} disabled={variants.length >= 3}>
            + Add size
          </Button>
        </div>
        {variants.length === 0 && (
          <p className="text-xs text-muted-foreground">No size variants — customers buy at the base price above.</p>
        )}
        {variants.map((variant, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={variant.size}
              onChange={(e) => updateVariant(i, "size", e.target.value)}
              className="rounded-md border p-2 text-sm"
            >
              {SIZE_OPTIONS.map((s) => (
                <option key={s} value={s} disabled={variants.some((v, j) => j !== i && v.size === s)}>
                  {s}
                </option>
              ))}
            </select>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="Price ($)"
              value={variant.priceDollars}
              onChange={(e) => updateVariant(i, "priceDollars", e.target.value)}
              className="w-32"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => removeVariant(i)}>Remove</Button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Photos (JPEG/PNG/WebP, max 5 MB each)</p>
        {([0, 1, 2] as const).map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <label htmlFor={`image-${i}`} className="text-xs text-muted-foreground">
              {i === 0 ? "Primary photo" : `Additional photo ${i + 1}`}
            </label>
            <input id={`image-${i}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImageFile(i, e.target.files?.[0] ?? null)} className="text-sm" />
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : isEditing ? "Save changes" : "Create snack"}
      </Button>
    </form>
  );
}