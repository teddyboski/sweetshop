"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import type { Database } from "@/types/supabase";

type Drop = Database["public"]["Tables"]["drops"]["Row"];
type Box = Pick<Database["public"]["Tables"]["boxes"]["Row"], "id" | "title">;

export interface DropFormProps {
  drop?: Drop;
  boxes: Box[];
}

export function DropForm({ drop, boxes }: DropFormProps) {
  const router = useRouter();
  const isEditing = Boolean(drop);

  const [boxId, setBoxId] = useState(drop?.box_id ?? boxes[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState(drop?.starts_at ? drop.starts_at.slice(0, 16) : "");
  const [endsAt, setEndsAt] = useState(drop?.ends_at ? drop.ends_at.slice(0, 16) : "");
  const [quantityLimit, setQuantityLimit] = useState(drop ? String(drop.quantity_limit) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      ...(isEditing ? {} : { boxId }),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      quantityLimit: Number(quantityLimit),
    };

    const response = await authenticatedFetch(isEditing ? `/api/admin/drops/${drop!.id}` : "/api/admin/drops", {
      method: isEditing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(body.error ?? "Save failed");
      return;
    }

    router.push("/admin/drops");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {!isEditing && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="boxId" className="text-sm font-medium">
            Box
          </label>
          <select id="boxId" value={boxId} onChange={(e) => setBoxId(e.target.value)} className="rounded-md border p-2 text-sm" required>
            {boxes.map((box) => (
              <option key={box.id} value={box.id}>
                {box.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="startsAt" className="text-sm font-medium">
          Starts at
        </label>
        <Input id="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="endsAt" className="text-sm font-medium">
          Ends at
        </label>
        <Input id="endsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="quantityLimit" className="text-sm font-medium">
          Quantity limit
        </label>
        <Input
          id="quantityLimit"
          type="number"
          value={quantityLimit}
          onChange={(e) => setQuantityLimit(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : isEditing ? "Save changes" : "Create drop"}
      </Button>
    </form>
  );
}
