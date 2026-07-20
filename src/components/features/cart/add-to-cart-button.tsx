"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type AddToCartPayload =
  | { itemType: "box"; boxSlug: string; quantity: number }
  | { itemType: "snack"; snackId: string; quantity: number };

export interface AddToCartButtonProps {
  payload: AddToCartPayload;
  label?: string;
}

export function AddToCartButton({ payload, label = "Add to Cart" }: AddToCartButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    setState("submitting");
    setErrorMessage(null);

    const response = await fetch("/api/cart/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setState("error");
      setErrorMessage(body?.error?.message ?? "Could not add to cart.");
      return;
    }

    setState("success");
    router.refresh();
  }

  return (
    <div>
      <Button size="lg" onClick={handleClick} disabled={state === "submitting"}>
        {state === "submitting" ? "Adding..." : label}
      </Button>
      {state === "success" && <p className="mt-2 text-sm font-medium text-primary">Added to your cart.</p>}
      {state === "error" && errorMessage && <p className="mt-2 text-sm text-destructive">{errorMessage}</p>}
    </div>
  );
}
