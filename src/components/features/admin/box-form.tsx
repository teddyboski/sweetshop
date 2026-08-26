"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import type { Database } from "@/types/supabase";

type Box = Database["public"]["Tables"]["boxes"]["Row"];

export interface BoxFormProps {
  box?: Box;
}

export function BoxForm({ box }: BoxFormProps) {
  const router = useRouter();
  const isEditing = Boolean(box);

  const [slug, setSlug] = useState(box?.slug ?? "");
  const [title, setTitle] = useState(box?.title ?? "");
  const [description, setDescription] = useState(box?.description ?? "");
  // Priced in dollars in the UI, converted to cents on submit - same fix
  // as snack-form.tsx (2026-08-12), same bug ("expected int, received
  // number" from typing e.g. "15.00" into a raw-cents field).
  const [priceDollars, setPriceDollars] = useState(box ? (box.price_cents / 100).toFixed(2) : "");
  const [isSubscription, setIsSubscription] = useState(box?.is_subscription ?? false);
  const [boxType, setBoxType] = useState(box?.box_type ?? "curated");
  // Milestone 18: which dedicated storefront page/nav destination this box
  // belongs on - orthogonal to boxType. Not applicable to build_a_box,
  // since that flow is reached directly, not via a category listing.
  const [category, setCategory] = useState(box?.category ?? "");
  const [slotCount, setSlotCount] = useState(box?.slot_count ? String(box.slot_count) : "");
  const [status, setStatus] = useState(box?.status ?? "draft");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      ...(isEditing ? {} : { slug }),
      title,
      description: description || null,
      priceCents: Math.round(Number(priceDollars) * 100),
      isSubscription,
      boxType,
      category: boxType === "build_a_box" ? null : category || null,
      slotCount: boxType === "build_a_box" ? Number(slotCount) : null,
      status,
    };

    const response = await authenticatedFetch(isEditing ? `/api/admin/boxes/${box!.id}` : "/api/admin/boxes", {
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

    const boxId = isEditing ? box!.id : body.data.id;

    if (imageFile) {
      const formData = new FormData();
      formData.append("file", imageFile);
      formData.append("boxId", boxId);
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
    router.push("/admin/boxes");
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
        <label htmlFor="title" className="text-sm font-medium">Title</label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">Description</label>
        <Input id="description" value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="priceDollars" className="text-sm font-medium">Price ($)</label>
        <Input
          id="priceDollars"
          type="number"
          step="0.01"
          min="0"
          placeholder="e.g. 15.00"
          value={priceDollars}
          onChange={(e) => setPriceDollars(e.target.value)}
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isSubscription} onChange={(e) => setIsSubscription(e.target.checked)} />
        Subscription box
      </label>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="boxType" className="text-sm font-medium">Box type</label>
        <select id="boxType" value={boxType} onChange={(e) => setBoxType(e.target.value)} className="rounded-md border p-2 text-sm">
          <option value="curated">Curated</option>
          <option value="build_a_box">Build-a-box</option>
          <option value="mystery">Mystery</option>
        </select>
      </div>
      {boxType === "build_a_box" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="slotCount" className="text-sm font-medium">Slot count</label>
          <Input id="slotCount" type="number" value={slotCount} onChange={(e) => setSlotCount(e.target.value)} required />
        </div>
      )}
      {boxType !== "build_a_box" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="category" className="text-sm font-medium">
            Storefront category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border p-2 text-sm"
          >
            <option value="">— None yet —</option>
            <option value="snack_box">Snack Box</option>
            <option value="candy_box">Candy Box</option>
            <option value="mystery_box">Mystery Box</option>
            <option value="passport_box">Passport Box</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Which shop page this box appears on. Leave unset to keep it off the new category pages for now.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="status" className="text-sm font-medium">Status</label>
        <select id="status" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border p-2 text-sm">
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
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
        {saving ? "Saving..." : isEditing ? "Save changes" : "Create box"}
      </Button>
    </form>
  );
}
