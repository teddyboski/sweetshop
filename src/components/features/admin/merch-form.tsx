"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import type { Database } from "@/types/supabase";

type MerchItem = Database["public"]["Tables"]["merch_items"]["Row"];

export interface MerchFormProps {
  merchItem?: MerchItem;
}

/** Mirrors SnackForm - same priced-in-dollars UI, same image upload flow (widened uploads route now accepts merchId). */
export function MerchForm({ merchItem }: MerchFormProps) {
  const router = useRouter();
  const isEditing = Boolean(merchItem);

  const [slug, setSlug] = useState(merchItem?.slug ?? "");
  const [name, setName] = useState(merchItem?.name ?? "");
  const [description, setDescription] = useState(merchItem?.description ?? "");
  const [category, setCategory] = useState(merchItem?.category ?? "");
  const [priceDollars, setPriceDollars] = useState(
    merchItem?.price_cents ? (merchItem.price_cents / 100).toFixed(2) : ""
  );
  const [status, setStatus] = useState(merchItem?.status ?? "draft");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const priceCents = priceDollars ? Math.round(Number(priceDollars) * 100) : NaN;
    if (!Number.isInteger(priceCents) || priceCents <= 0) {
      setError("Price is required and must be greater than $0");
      return;
    }

    setSaving(true);

    const payload = {
      ...(isEditing ? {} : { slug }),
      name,
      description: description || null,
      category: category || null,
      priceCents,
      status,
    };

    const response = await authenticatedFetch(isEditing ? `/api/admin/merch/${merchItem!.id}` : "/api/admin/merch", {
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

    const merchItemId = isEditing ? merchItem!.id : body.data.id;

    if (imageFile) {
      const formData = new FormData();
      formData.append("file", imageFile);
      formData.append("merchId", merchItemId);
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
    if (isEditing) {
      router.refresh();
    } else {
      router.push(`/admin/merch/${merchItemId}`);
    }
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
          onChange={(e) => setStatus(e.target.value as "draft" | "active" | "archived")}
          className="rounded-md border p-2 text-sm"
        >
          <option value="draft">Draft - hidden, still being set up</option>
          <option value="active">Active - visible to customers</option>
          <option value="archived">Archived - hidden, don&apos;t carry anymore</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="category" className="text-sm font-medium">Category</label>
        <Input
          id="category"
          list="merch-categories"
          value={category ?? ""}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. apparel, accessories, drinkware"
        />
        <datalist id="merch-categories">
          <option value="apparel" />
          <option value="accessories" />
          <option value="drinkware" />
        </datalist>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">Description</label>
        <textarea
          id="description"
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="rounded-md border p-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="priceDollars" className="text-sm font-medium">Base price ($)</label>
        <Input
          id="priceDollars"
          type="number"
          step="0.01"
          min="0"
          placeholder="e.g. 24.00"
          value={priceDollars}
          onChange={(e) => setPriceDollars(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          What a variant costs unless a size/color needs its own override price below.
        </p>
      </div>
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
        {saving ? "Saving..." : isEditing ? "Save changes" : "Create item"}
      </Button>
      {!isEditing && (
        <p className="text-xs text-muted-foreground">
          After creating the item, you&apos;ll add its size/color variants and starting stock on the next screen.
        </p>
      )}
    </form>
  );
}
