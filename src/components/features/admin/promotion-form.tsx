"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import type { Database } from "@/types/supabase";

type Promotion = Database["public"]["Tables"]["promotions"]["Row"];

export interface PromotionFormProps {
  promotion?: Promotion;
}

export function PromotionForm({ promotion }: PromotionFormProps) {
  const router = useRouter();
  const isEditing = Boolean(promotion);

  const [code, setCode] = useState(promotion?.code ?? "");
  const [discountType, setDiscountType] = useState(promotion?.discount_type ?? "percent");
  const [value, setValue] = useState(promotion ? String(promotion.value) : "");
  const [usageLimit, setUsageLimit] = useState(promotion?.usage_limit ? String(promotion.usage_limit) : "");
  const [expiresAt, setExpiresAt] = useState(promotion?.expires_at ? promotion.expires_at.slice(0, 16) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      ...(isEditing ? {} : { code }),
      discountType,
      value: Number(value),
      usageLimit: usageLimit ? Number(usageLimit) : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    };

    const response = await authenticatedFetch(
      isEditing ? `/api/admin/promotions/${promotion!.id}` : "/api/admin/promotions",
      {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const body = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(body.error ?? "Save failed");
      return;
    }

    router.push("/admin/promotions");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {!isEditing && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-sm font-medium">
            Code
          </label>
          <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="discountType" className="text-sm font-medium">
          Discount type
        </label>
        <select
          id="discountType"
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value)}
          className="rounded-md border p-2 text-sm"
        >
          <option value="percent">Percent</option>
          <option value="fixed">Fixed amount</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="value" className="text-sm font-medium">
          Value {discountType === "percent" ? "(%)" : "(cents)"}
        </label>
        <Input id="value" type="number" value={value} onChange={(e) => setValue(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="usageLimit" className="text-sm font-medium">
          Usage limit (blank = unlimited)
        </label>
        <Input id="usageLimit" type="number" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="expiresAt" className="text-sm font-medium">
          Expires at (blank = never)
        </label>
        <Input id="expiresAt" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : isEditing ? "Save changes" : "Create promotion"}
      </Button>
    </form>
  );
}
