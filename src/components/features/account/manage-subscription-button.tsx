"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";

export function ManageSubscriptionButton() {
  const [state, setState] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    setState("submitting");
    setErrorMessage(null);

    const response = await authenticatedFetch("/api/account/subscriptions/portal-session", { method: "POST" });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.data?.url) {
      setState("error");
      setErrorMessage(result?.error?.message ?? "Could not open the subscription portal.");
      return;
    }

    // Full navigation, not router.push - the destination is Stripe's hosted
    // Customer Portal, not a route inside this app.
    window.location.href = result.data.url;
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={handleClick} disabled={state === "submitting"}>
        {state === "submitting" ? "Opening..." : "Manage Subscription"}
      </Button>
      {state === "error" && errorMessage && <p className="mt-2 text-sm text-destructive">{errorMessage}</p>}
    </div>
  );
}
