"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatPriceCents } from "@/lib/utils";
import { useBuildABoxStore } from "@/lib/stores/build-a-box-store";

interface BoxOption {
  id: string;
  slug: string;
  title: string;
  price_cents: number;
  slot_count: number | null;
}

interface Snack {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  price_cents: number | null;
}

export interface BuildABoxPickerProps {
  boxes: BoxOption[];
  snacks: Snack[];
}

export function BuildABoxPicker({ boxes, snacks }: BuildABoxPickerProps) {
  const [selectedBox, setSelectedBox] = useState<BoxOption | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const { selections, totalPicked, addSnack, removeSnack, setSlotCount, reset } = useBuildABoxStore();

  function selectBox(box: BoxOption) {
    setSelectedBox(box);
    setSlotCount(box.slot_count ?? 0);
    reset();
    setSubmitState("idle");
  }

  async function handleSubmit() {
    if (!selectedBox) return;
    setSubmitState("submitting");
    setSubmitMessage(null);

    const response = await fetch("/api/cart/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemType: "build_a_box",
        boxSlug: selectedBox.slug,
        snacks: Object.entries(selections).map(([snackId, quantity]) => ({ snackId, quantity })),
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      setSubmitState("error");
      setSubmitMessage(body.error?.message ?? "Something went wrong. Please try again.");
      return;
    }

    setSubmitState("success");
    reset();
  }

  const picked = totalPicked();
  const target = selectedBox?.slot_count ?? 0;
  const canSubmit = selectedBox !== null && picked === target && submitState !== "submitting";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold">Build Your Own Box</h1>
      <p className="mt-1 text-muted-foreground">Pick a size, then choose exactly that many snacks.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3" role="radiogroup" aria-label="Box size">
        {boxes.map((box) => (
          <button key={box.id} type="button" onClick={() => selectBox(box)} aria-pressed={selectedBox?.id === box.id}>
            <Card className={selectedBox?.id === box.id ? "ring-2 ring-primary" : ""}>
              <CardHeader>
                <CardTitle>{box.title}</CardTitle>
                <CardDescription>
                  {formatPriceCents(box.price_cents)} - {box.slot_count} items
                </CardDescription>
              </CardHeader>
            </Card>
          </button>
        ))}
      </div>

      {selectedBox && (
        <>
          <div className="sticky top-0 z-10 mt-8 flex items-center justify-between rounded-lg border bg-background/95 p-3 backdrop-blur">
            <p className="font-medium" aria-live="polite">
              {picked} / {target} picked
            </p>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitState === "submitting" ? "Adding..." : "Add to Cart"}
            </Button>
          </div>

          {submitState === "success" && (
            <p className="mt-4 text-sm font-medium text-primary">Added to your cart.</p>
          )}
          {submitState === "error" && submitMessage && (
            <p className="mt-4 text-sm text-destructive">{submitMessage}</p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {snacks.map((snack) => {
              const qty = selections[snack.id] ?? 0;
              return (
                <Card key={snack.id} size="sm">
                  <CardHeader>
                    <CardTitle>{snack.name}</CardTitle>
                    <CardDescription>{formatPriceCents(snack.price_cents ?? 0)}</CardDescription>
                  </CardHeader>
                  <div className="flex items-center justify-center gap-2 px-3 pb-3">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Remove one ${snack.name}`}
                      onClick={() => removeSnack(snack.id)}
                      disabled={qty === 0}
                    >
                      <Minus />
                    </Button>
                    <span className="w-6 text-center tabular-nums" aria-live="polite">
                      {qty}
                    </span>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Add one ${snack.name}`}
                      onClick={() => addSnack(snack.id)}
                      disabled={picked >= target}
                    >
                      <Plus />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
