"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPriceCents } from "@/lib/utils";
import type { CartLine } from "@/lib/supabase/queries/cart";

export interface CartLineRowProps {
  line: CartLine;
}

export function CartLineRow({ line }: CartLineRowProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function patchQuantity(nextQuantity: number) {
    setPending(true);
    setErrorMessage(null);

    const response = await fetch(`/api/cart/items/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: nextQuantity }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setErrorMessage(body?.error?.message ?? "Could not update quantity.");
      setPending(false);
      return;
    }

    router.refresh();
  }

  async function removeLine() {
    setPending(true);
    setErrorMessage(null);

    const response = await fetch(`/api/cart/items/${line.id}`, { method: "DELETE" });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setErrorMessage(body?.error?.message ?? "Could not remove item.");
      setPending(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex-1">
        <p className="font-medium">{line.name}</p>

        {line.isBuildABox && line.snackSelections && (
          <ul className="mt-1 text-sm text-muted-foreground">
            {line.snackSelections.map((s) => (
              <li key={s.snackId}>
                {s.quantity} x {s.name}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-1 text-sm text-muted-foreground">{formatPriceCents(line.unitPriceCents)} each</p>
        {errorMessage && <p className="mt-1 text-sm text-destructive">{errorMessage}</p>}
      </div>

      <div className="flex flex-col items-end gap-2">
        <p className="font-medium tabular-nums">{formatPriceCents(line.unitPriceCents * line.quantity)}</p>

        {line.isBuildABox ? (
          <p className="text-sm text-muted-foreground">Qty {line.quantity}</p>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Decrease quantity of ${line.name}`}
              onClick={() => patchQuantity(line.quantity - 1)}
              disabled={pending || line.quantity <= 1}
            >
              <Minus />
            </Button>
            <span className="w-6 text-center tabular-nums" aria-live="polite">
              {line.quantity}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Increase quantity of ${line.name}`}
              onClick={() => patchQuantity(line.quantity + 1)}
              disabled={pending}
            >
              <Plus />
            </Button>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${line.name} from cart`}
          onClick={removeLine}
          disabled={pending}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
