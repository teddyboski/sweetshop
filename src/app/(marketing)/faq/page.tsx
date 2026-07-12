import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQs | Shipping, Subscriptions & More — The Sweet Shop",
  description:
    "Answers on shipping speed, mystery boxes, subscription cancellation, international shipping, and allergens.",
};

const faqs = [
  {
    q: "How fast do you ship?",
    a: "Every box is packed fresh to order and ships fast, domestically.",
  },
  {
    q: "What if I don't like what's in my Mystery Box?",
    a: "That's the fun of it — but if something's wrong with your order, email us and we'll make it right.",
  },
  {
    q: "Can I cancel my subscription?",
    a: "Yes, anytime, from your account page. No contracts.",
  },
  {
    q: "Do you ship internationally?",
    a: "Not yet — domestic U.S. shipping only for now.",
  },
  {
    q: "Are allergens listed?",
    a: "Each snack's page lists nutrition info where available — always check before gifting to someone with dietary restrictions.",
  },
];

export default function Faq() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">Frequently Asked Questions</h1>
      <div className="mt-8 space-y-2">
        {faqs.map((item) => (
          <details key={item.q} className="rounded-md border p-4">
            <summary className="cursor-pointer font-medium">{item.q}</summary>
            <p className="mt-2 text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
      <p className="mt-8 text-muted-foreground">
        Still have questions?{" "}
        <Link href="/contact" className="underline">
          Email us
        </Link>{" "}
        — or if you&apos;re ready, <Link href="/shop" className="underline">shop now</Link>.
      </p>
    </main>
  );
}
