import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Monthly Snack Box Subscription | $50/mo Exotic Snacks — The Sweet Shop",
  description:
    "A fresh exotic snack haul every month for $50. Cancel anytime, no contracts.",
};

export default function Subscriptions() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">A fresh exotic haul, every month.</h1>
      <p className="mt-2 text-2xl font-semibold">$50/month</p>
      <p className="mt-4 text-lg text-muted-foreground">
        Curated by The Sweet Shop. New flavors, new imports, always worth more
        than you paid.
      </p>
      <p className="mt-2 font-medium">Cancel anytime — no contracts, no hassle.</p>
      <Link
        href="/shop"
        className="mt-8 inline-block rounded-md bg-primary px-6 py-3 text-primary-foreground"
      >
        Subscribe Now
      </Link>
    </main>
  );
}
