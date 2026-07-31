"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

export function RoleChangeForm() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"customer" | "admin">("admin");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    const response = await authenticatedFetch(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const body = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(body.error ?? "Role change failed");
      return;
    }

    setSuccess(`${body.data.id} is now ${body.data.role}.`);
    setUserId("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="userId" className="text-sm font-medium">
          User ID
        </label>
        <Input id="userId" value={userId} onChange={(e) => setUserId(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="role" className="text-sm font-medium">
          Role
        </label>
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value as "customer" | "admin")}
          className="rounded-md border p-2 text-sm"
        >
          <option value="customer">Customer</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-primary">{success}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : "Change role"}
      </Button>
    </form>
  );
}
