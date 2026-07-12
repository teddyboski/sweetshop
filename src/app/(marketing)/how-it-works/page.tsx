import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How It Works | The Sweet Shop — Order, Ship, Earn Rewards",
  description:
    "Pick your box, we pack it fresh and ship fast, you earn rewards on every order, and you can refer friends for credit.",
};

const steps = [
  { title: "Pick your box", body: "Curated, mystery, or build-your-own." },
  { title: "We pack it fresh", body: "Hand-packed to order, shipped fast." },
  { title: "Earn rewards", body: "Every order earns points toward your next box." },
  { title: "Refer a friend", body: "You both get credit when they order." },
];

export default function HowItWorks() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">How It Works</h1>
      <ol className="mt-8 space-y-6">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span className="text-2xl font-bold text-muted-foreground">{i + 1}</span>
            <div>
              <h2 className="font-semibold">{step.title}</h2>
              <p className="text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link
        href="/shop"
        className="mt-8 inline-block rounded-md bg-primary px-6 py-3 text-primary-foreground"
      >
        Shop Now
      </Link>
    </main>
  );
}
