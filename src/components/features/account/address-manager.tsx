"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import type { CustomerAddress } from "@/lib/supabase/queries/account";

const EMPTY_FORM = {
  label: "",
  recipientName: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
};

export interface AddressManagerProps {
  initialAddresses: CustomerAddress[];
}

export function AddressManager({ initialAddresses }: AddressManagerProps) {
  const [addresses, setAddresses] = useState(initialAddresses);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [state, setState] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setErrorMessage(null);

    const response = await authenticatedFetch("/api/account/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, isDefault: addresses.length === 0 }),
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.data) {
      setState("error");
      setErrorMessage(result?.error?.message ?? "Could not save address.");
      return;
    }

    const created: CustomerAddress = result.data;
    setAddresses((previous) =>
      created.isDefault ? [created, ...previous.map((a) => ({ ...a, isDefault: false }))] : [...previous, created]
    );
    setForm(EMPTY_FORM);
    setShowForm(false);
    setState("idle");
  }

  async function handleSetDefault(id: string) {
    const response = await authenticatedFetch(`/api/account/addresses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (!response.ok) return;

    setAddresses((previous) => previous.map((a) => ({ ...a, isDefault: a.id === id })));
  }

  async function handleDelete(id: string) {
    const response = await authenticatedFetch(`/api/account/addresses/${id}`, { method: "DELETE" });
    if (!response.ok) return;

    setAddresses((previous) => previous.filter((a) => a.id !== id));
  }

  return (
    <div className="mt-6 space-y-4 rounded-lg border p-4">
      <h2 className="font-heading text-lg font-semibold">Addresses</h2>

      {addresses.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
      )}

      <div className="space-y-3">
        {addresses.map((address) => (
          <div key={address.id} className="flex items-start justify-between rounded-lg border p-3 text-sm">
            <div>
              {address.isDefault && <p className="text-xs font-medium text-primary">Default</p>}
              <p className="font-medium">{address.recipientName}</p>
              <p className="text-muted-foreground">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}
                <br />
                {address.city}, {address.state} {address.postalCode}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {!address.isDefault && (
                <Button variant="outline" size="sm" onClick={() => handleSetDefault(address.id)}>
                  Set default
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={() => handleDelete(address.id)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      {showForm ? (
        <form onSubmit={handleAddSubmit} className="space-y-2 rounded-lg border p-3">
          <Input
            placeholder="Recipient name"
            required
            value={form.recipientName}
            onChange={(event) => setForm({ ...form, recipientName: event.target.value })}
          />
          <Input
            placeholder="Address line 1"
            required
            value={form.line1}
            onChange={(event) => setForm({ ...form, line1: event.target.value })}
          />
          <Input
            placeholder="Address line 2 (optional)"
            value={form.line2}
            onChange={(event) => setForm({ ...form, line2: event.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="City"
              required
              value={form.city}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
            />
            <Input
              placeholder="State"
              required
              value={form.state}
              onChange={(event) => setForm({ ...form, state: event.target.value })}
            />
            <Input
              placeholder="Postal code"
              required
              value={form.postalCode}
              onChange={(event) => setForm({ ...form, postalCode: event.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={state === "submitting"}>
              {state === "submitting" ? "Saving..." : "Save address"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
          {state === "error" && errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
          Add address
        </Button>
      )}
    </div>
  );
}
