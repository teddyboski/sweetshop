"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

export function RewardsAdjustForm() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [deltaPoints, setDeltaPoints] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const response = await authenticatedFetch("/api/admin/rewards/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, deltaPoints: Number(deltaPoints) }),
    });
    const body = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(body.error ?? "Adjustment failed");
      return;
    }

    setUserId("");
    setDeltaPoints("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="userId" className="text-sm font-medium">
          Customer user ID
        </label>
        <Input id="userId" value={userId} onChange={(e) => setUserId(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="deltaPoints" className="text-sm font-medium">
          Points adjustment (+/-)
        </label>
        <Input
          id="deltaPoints"
          type="number"
          value={deltaPoints}
          onChange={(e) => setDeltaPoints(e.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : "Apply adjustment"}
      </Button>
    </form>
  );
}
