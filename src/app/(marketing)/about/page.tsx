import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About The Sweet Shop — Curated Snacks, Hand-Packed With Love",
  description:
    "The Sweet Shop started live on Whatnot and never stopped hand-packing every box fresh to order.",
};

export default function About() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">
        We started on Whatnot. We never stopped hand-packing.
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        The Sweet Shop began as a live-selling snack shop — literally packing
        boxes on camera for people who love snacks as much as we do. Every box
        is still hand-packed fresh to order, no exceptions. We just added a
        storefront so you don&apos;t have to catch us live to get in on it.
      </p>
      <Link
        href="/shop"
        className="mt-8 inline-block rounded-md bg-primary px-6 py-3 text-primary-foreground"
      >
        Shop Boxes
      </Link>
    </main>
  );
}
