"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

export interface CheckoutButtonProps {
  isAuthenticated: boolean;
  // Milestone 9: 0 for guests (they can't redeem) and for authenticated users
  // with no balance - either way the redeem input just stays hidden/disabled.
  rewardsBalance?: number;
}

export function CheckoutButton({ isAuthenticated, rewardsBalance = 0 }: CheckoutButtonProps) {
  const [showEmailField, setShowEmailField] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [redeemPoints, setRedeemPoints] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function discountFields(): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    const trimmedPromo = promoCode.trim();
    if (trimmedPromo) fields.promoCode = trimmedPromo;

    const points = Number(redeemPoints);
    if (isAuthenticated && redeemPoints.trim() && Number.isInteger(points) && points > 0) {
      fields.redeemPoints = points;
    }
    return fields;
  }

  async function startCheckout(body: Record<string, unknown>) {
    setState("submitting");
    setErrorMessage(null);

    const response = await authenticatedFetch("/api/checkout/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, ...discountFields() }),
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.data?.url) {
      setState("error");
      setErrorMessage(result?.error?.message ?? "Could not start checkout.");
      return;
    }

    // Full navigation, not router.push - the destination is Stripe's hosted
    // Checkout page, not a route inside this app.
    window.location.href = result.data.url;
  }

  function handleCheckoutClick() {
    if (isAuthenticated) {
      void startCheckout({});
      return;
    }
    setShowEmailField(true);
  }

  function handleGuestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void startCheckout({ guestEmail });
  }

  const discountInputs = (
    <div className="space-y-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="promo-code" className="text-sm font-medium">
          Promo code
        </label>
        <Input
          id="promo-code"
          value={promoCode}
          onChange={(event) => setPromoCode(event.target.value)}
          placeholder="Optional"
        />
      </div>
      {isAuthenticated && rewardsBalance > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="redeem-points" className="text-sm font-medium">
            Redeem rewards points ({rewardsBalance} available)
          </label>
          <Input
            id="redeem-points"
            type="number"
            min={0}
            max={rewardsBalance}
            step={1}
            value={redeemPoints}
            onChange={(event) => setRedeemPoints(event.target.value)}
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">100 points = $1 off</p>
        </div>
      )}
    </div>
  );

  if (showEmailField && !isAuthenticated) {
    return (
      <form onSubmit={handleGuestSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="guest-checkout-email" className="text-sm font-medium">
            Email for your order confirmation
          </label>
          <Input
            id="guest-checkout-email"
            type="email"
            required
            value={guestEmail}
            onChange={(event) => setGuestEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>
        {discountInputs}
        <Button type="submit" size="lg" className="w-full" disabled={state === "submitting"}>
          {state === "submitting" ? "Starting checkout..." : "Continue to Payment"}
        </Button>
        {state === "error" && errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {discountInputs}
      <Button size="lg" className="w-full" onClick={handleCheckoutClick} disabled={state === "submitting"}>
        {state === "submitting" ? "Starting checkout..." : "Checkout"}
      </Button>
      {state === "error" && errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
    </div>
  );
}
