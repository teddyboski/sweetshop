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
  const [priceCents, setPriceCents] = useState(snack?.price_cents ? String(snack.price_cents) : "");
  const [isSellableIndividually, setIsSellableIndividually] = useState(snack?.is_sellable_individually ?? false);
  const [isByoEligible, setIsByoEligible] = useState(snack?.is_byo_eligible ?? true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      ...(isEditing ? {} : { slug }),
      name,
      brand: brand || null,
      category: category || null,
      priceCents: priceCents ? Number(priceCents) : null,
      isSellableIndividually,
      isByoEligible,
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
        <label htmlFor="brand" className="text-sm font-medium">Brand</label>
        <Input id="brand" value={brand ?? ""} onChange={(e) => setBrand(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="category" className="text-sm font-medium">Category</label>
        <Input id="category" value={category ?? ""} onChange={(e) => setCategory(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="priceCents" className="text-sm font-medium">Price (cents)</label>
        <Input id="priceCents" type="number" value={priceCents} onChange={(e) => setPriceCents(e.target.value)} />
      </div>
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
