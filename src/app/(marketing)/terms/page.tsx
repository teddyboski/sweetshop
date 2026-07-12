import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — The Sweet Shop",
  description: "The terms that govern orders, subscriptions, shipping, and rewards at The Sweet Shop.",
};

export default function Terms() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <div className="mt-6 space-y-4 text-muted-foreground">
        <p>Orders are processed and paid for via Stripe. All prices are in USD.</p>
        <p>
          Subscriptions bill monthly and you can cancel anytime from your
          account page. We don&apos;t offer partial-month refunds.
        </p>
        <p>
          We currently ship domestically within the U.S. only, and can&apos;t
          guarantee an exact delivery date.
        </p>
        <p>
          Due to the nature of food products, we don&apos;t accept returns —
          but contact us if there&apos;s a problem with your order and
          we&apos;ll make it right.
        </p>
        <p>
          Rewards points and referral credits have no cash value and may
          change over time. Abuse of the rewards or referral program,
          including self-referral or fake accounts, forfeits those rewards.
        </p>
      </div>
    </main>
  );
}
