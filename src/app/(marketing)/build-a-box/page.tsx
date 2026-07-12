import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Build Your Own Snack Box | Custom Snack Boxes — The Sweet Shop",
  description:
    "Pick a size, tell us your preferences, and we'll hand-pack a custom snack box just for you. Perfect for picky snackers and gifts.",
};

export default function BuildABox() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">Three sizes. Your call on what&apos;s inside.</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Small (8 items) · Medium (15 items) · Large (25 items). Tell us your
        preferences, we&apos;ll pack it fresh — perfect for picky snackers and
        even better as a gift.
      </p>
      <p className="mt-2 font-medium">
        Small $15 · Medium $25 · Large $35 — one flat price per size, no
        surprises at checkout.
      </p>
      <Link
        href="/shop/build-a-box"
        className="mt-8 inline-block rounded-md bg-primary px-6 py-3 text-primary-foreground"
      >
        Start Building
      </Link>
    </main>
  );
}
