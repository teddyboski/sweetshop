"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/authenticated-fetch";
import type { CustomerPreferences } from "@/lib/supabase/queries/account";

const SPICE_TOLERANCE_OPTIONS = ["", "mild", "medium", "hot", "extra_hot"] as const;

function toCommaList(values: string[]): string {
  return values.join(", ");
}

function fromCommaList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export interface PreferencesFormProps {
  initialPreferences: CustomerPreferences | null;
}

export function PreferencesForm({ initialPreferences }: PreferencesFormProps) {
  const [dietaryRestrictions, setDietaryRestrictions] = useState(
    toCommaList(initialPreferences?.dietaryRestrictions ?? [])
  );
  const [dislikedCategories, setDislikedCategories] = useState(
    toCommaList(initialPreferences?.dislikedCategories ?? [])
  );
  const [flavorProfile, setFlavorProfile] = useState(toCommaList(initialPreferences?.flavorProfile ?? []));
  const [spiceTolerance, setSpiceTolerance] = useState(initialPreferences?.spiceTolerance ?? "");
  const [marketingOptIn, setMarketingOptIn] = useState(initialPreferences?.marketingOptIn ?? true);
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setErrorMessage(null);

    const response = await authenticatedFetch("/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dietaryRestrictions: fromCommaList(dietaryRestrictions),
        dislikedCategories: fromCommaList(dislikedCategories),
        flavorProfile: fromCommaList(flavorProfile),
        spiceTolerance: spiceTolerance || null,
        marketingOptIn,
      }),
    });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      setState("error");
      setErrorMessage(result?.error?.message ?? "Could not save preferences.");
      return;
    }

    setState("success");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
      <h2 className="font-heading text-lg font-semibold">Preferences</h2>

      <div>
        <label htmlFor="dietary-restrictions" className="text-sm font-medium">
          Dietary restrictions
        </label>
        <Input
          id="dietary-restrictions"
          value={dietaryRestrictions}
          onChange={(event) => setDietaryRestrictions(event.target.value)}
          placeholder="nut-free, gluten-free"
        />
        <p className="mt-1 text-xs text-muted-foreground">Comma-separated</p>
      </div>

      <div>
        <label htmlFor="disliked-categories" className="text-sm font-medium">
          Disliked categories
        </label>
        <Input
          id="disliked-categories"
          value={dislikedCategories}
          onChange={(event) => setDislikedCategories(event.target.value)}
          placeholder="licorice, sour"
        />
      </div>

      <div>
        <label htmlFor="flavor-profile" className="text-sm font-medium">
          Favorite flavors
        </label>
        <Input
          id="flavor-profile"
          value={flavorProfile}
          onChange={(event) => setFlavorProfile(event.target.value)}
          placeholder="sweet, salty"
        />
      </div>

      <div>
        <label htmlFor="spice-tolerance" className="text-sm font-medium">
          Spice tolerance
        </label>
        <select
          id="spice-tolerance"
          value={spiceTolerance ?? ""}
          onChange={(event) => setSpiceTolerance(event.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {SPICE_TOLERANCE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "" ? "Not set" : option.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={marketingOptIn}
          onChange={(event) => setMarketingOptIn(event.target.checked)}
          className="size-4 rounded border-input"
        />
        Send me promotions and product updates
      </label>

      <Button type="submit" disabled={state === "submitting"}>
        {state === "submitting" ? "Saving..." : "Save preferences"}
      </Button>
      {state === "success" && <p className="text-sm text-primary">Saved.</p>}
      {state === "error" && errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
    </form>
  );
}
