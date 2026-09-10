"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatPriceCents } from "@/lib/utils";
import { useBuildABoxStore } from "@/lib/stores/build-a-box-store";
import { SNACK_TYPES, FLAVORS, type SnackType, type Flavor } from "@/lib/validations/cart";

interface BoxOption {
  id: string;
  slug: string;
  title: string;
  price_cents: number;
  slot_count: number | null;
}

export interface BuildABoxPickerProps {
  boxes: BoxOption[];
}

const SNACK_TYPE_LABELS: Record<SnackType, string> = {
  chips: "Chips / Crisps",
  candy: "Candy",
  cookies: "Cookies",
  cakes: "Cakes / Pastries",
  crackers: "Crackers",
  nuts: "Nuts / Trail Mix",
  gummies: "Gummies",
  chocolate: "Chocolate",
};

const FLAVOR_LABELS: Record<Flavor, string> = {
  sweet: "Sweet",
  salty: "Salty",
  spicy: "Spicy / Hot",
  sour: "Sour",
  savory: "Savory",
  fruity: "Fruity",
  chocolatey: "Chocolatey",
};

export function BuildABoxPicker({ boxes }: BuildABoxPickerProps) {
  const [selectedBox, setSelectedBox] = useState<BoxOption | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const { selectedSnackTypes, selectedFlavors, toggleSnackType, toggleFlavor, reset } = useBuildABoxStore();

  function selectBox(box: BoxOption) {
    setSelectedBox(box);
    reset();
    setSubmitState("idle");
    setSubmitMessage(null);
  }

  async function handleSubmit() {
    if (!selectedBox) return;
    if (selectedSnackTypes.size === 0 || selectedFlavors.size === 0) return;

    setSubmitState("submitting");
    setSubmitMessage(null);

    const response = await fetch("/api/cart/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemType: "build_a_box",
        boxSlug: selectedBox.slug,
        preferences: {
          snackTypes: Array.from(selectedSnackTypes),
          flavors: Array.from(selectedFlavors),
        },
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

  const canSubmit =
    selectedBox !== null &&
    selectedSnackTypes.size > 0 &&
    selectedFlavors.size > 0 &&
    submitState !== "submitting";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-heading text-2xl font-semibold">Build Your Own Box</h1>
      <p className="mt-1 text-muted-foreground">
        Pick a size, then tell us your snack preferences — we&apos;ll hand-pack it fresh.
      </p>

      <h2 className="mt-8 font-heading text-lg font-semibold">Step 1 — Choose a size</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3" role="radiogroup" aria-label="Box size">
        {boxes.map((box) => (
          <button
            key={box.id}
            type="button"
            onClick={() => selectBox(box)}
            aria-pressed={selectedBox?.id === box.id}
          >
            <Card className={selectedBox?.id === box.id ? "ring-2 ring-primary" : ""}>
              <CardHeader>
                <CardTitle>{box.title}</CardTitle>
                <CardDescription>
                  {formatPriceCents(box.price_cents)} &mdash; {box.slot_count} items
                </CardDescription>
              </CardHeader>
            </Card>
          </button>
        ))}
      </div>

      {selectedBox && (
        <>
          <h2 className="mt-10 font-heading text-lg font-semibold">Step 2 — Snack types</h2>
          <p className="mt-1 text-sm text-muted-foreground">Check everything you&apos;d like included.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SNACK_TYPES.map((type) => (
              <label
                key={type}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                  selectedSnackTypes.has(type)
                    ? "border-primary bg-primary/5 font-medium"
                    : "hover:bg-muted"
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={selectedSnackTypes.has(type)}
                  onChange={() => toggleSnackType(type)}
                />
                {SNACK_TYPE_LABELS[type]}
              </label>
            ))}
          </div>

          <h2 className="mt-10 font-heading text-lg font-semibold">Step 3 — Flavor preferences</h2>
          <p className="mt-1 text-sm text-muted-foreground">Check all the flavors you enjoy.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FLAVORS.map((flavor) => (
              <label
                key={flavor}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                  selectedFlavors.has(flavor)
                    ? "border-primary bg-primary/5 font-medium"
                    : "hover:bg-muted"
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={selectedFlavors.has(flavor)}
                  onChange={() => toggleFlavor(flavor)}
                />
                {FLAVOR_LABELS[flavor]}
              </label>
            ))}
          </div>

          <div className="sticky bottom-4 mt-8 flex items-center justify-between rounded-lg border bg-background/95 p-3 shadow-md backdrop-blur">
            <p className="text-sm text-muted-foreground">
              {selectedBox.title} &mdash; {formatPriceCents(selectedBox.price_cents)}
            </p>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitState === "submitting" ? "Adding..." : "Add to Cart"}
            </Button>
          </div>

          {submitState === "success" && (
            <p className="mt-4 text-sm font-medium text-primary">Added to your cart!</p>
          )}
          {submitState === "error" && submitMessage && (
            <p className="mt-4 text-sm text-destructive">{submitMessage}</p>
          )}
        </>
      )}
    </div>
  );
}
