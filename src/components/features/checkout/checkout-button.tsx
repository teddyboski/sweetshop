"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

export interface CheckoutButtonProps {
  isAuthenticated: boolean;
}

export function CheckoutButton({ isAuthenticated }: CheckoutButtonProps) {
  const [showEmailField, setShowEmailField] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function startCheckout(body: Record<string, unknown>) {
    setState("submitting");
    setErrorMessage(null);

    const response = await authenticatedFetch("/api/checkout/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  if (showEmailField && !isAuthenticated) {
    return (
      <form onSubmit={handleGuestSubmit} className="space-y-2">
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
        <Button type="submit" size="lg" className="w-full" disabled={state === "submitting"}>
          {state === "submitting" ? "Starting checkout..." : "Continue to Payment"}
        </Button>
        {state === "error" && errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      </form>
    );
  }

  return (
    <div>
      <Button size="lg" className="w-full" onClick={handleCheckoutClick} disabled={state === "submitting"}>
        {state === "submitting" ? "Starting checkout..." : "Checkout"}
      </Button>
      {state === "error" && errorMessage && <p className="mt-2 text-sm text-destructive">{errorMessage}</p>}
    </div>
  );
}
