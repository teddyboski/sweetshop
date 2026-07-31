"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

export interface OrderActionsProps {
  orderId: string;
  status: string;
  trackingNumber: string | null;
  hasPaymentIntent: boolean;
}

export function OrderActions({ orderId, status, trackingNumber, hasPaymentIntent }: OrderActionsProps) {
  const router = useRouter();
  const [tracking, setTracking] = useState(trackingNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function patchOrder(body: Record<string, unknown>) {
    setError(null);
    setSaving(true);
    const response = await authenticatedFetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(responseBody.error ?? "Update failed");
      return;
    }
    router.refresh();
  }

  async function handleFulfill(e: React.FormEvent) {
    e.preventDefault();
    await patchOrder({ status: "fulfilled", trackingNumber: tracking });
  }

  async function handleRefund() {
    if (!confirm("Refund this order via Stripe? This cannot be undone.")) return;
    setError(null);
    setSaving(true);
    const response = await authenticatedFetch(`/api/admin/orders/${orderId}/refund`, { method: "POST" });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(body.error ?? "Refund failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {status === "paid" && (
        <form onSubmit={handleFulfill} className="flex flex-col gap-2">
          <label htmlFor="tracking" className="text-sm font-medium">
            Tracking number
          </label>
          <div className="flex gap-2">
            <Input
              id="tracking"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="1Z999..."
              required
            />
            <Button type="submit" disabled={saving}>
              {saving ? "..." : "Mark fulfilled"}
            </Button>
          </div>
        </form>
      )}

      {status === "fulfilled" && (
        <Button variant="outline" size="sm" disabled={saving} onClick={() => patchOrder({ status: "shipped" })}>
          Mark shipped
        </Button>
      )}

      {["pending", "paid", "fulfilled", "shipped"].includes(status) && (
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => {
            if (confirm("Cancel this order?")) void patchOrder({ status: "cancelled" });
          }}
        >
          Cancel order
        </Button>
      )}

      {status !== "refunded" && (
        <Button variant="destructive" size="sm" disabled={saving || !hasPaymentIntent} onClick={handleRefund}>
          {hasPaymentIntent ? "Refund via Stripe" : "No payment intent on file"}
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
