import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — The Sweet Shop",
  description: "How The Sweet Shop collects, uses, and protects your data.",
};

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <div className="mt-6 space-y-4 text-muted-foreground">
        <p>
          We collect your email, shipping address, order history, and any
          preferences you tell us about, so we can fulfill and personalize
          your orders.
        </p>
        <p>
          Payments are processed by Stripe — we never store your card details
          directly. We share data only with the processors we use to run the
          business: Stripe (payments), Resend (order emails), and Supabase
          (hosting). We do not sell your data to anyone.
        </p>
        <p>
          We use session and authentication cookies only — no third-party ad
          tracking.
        </p>
        <p>
          You can request access to or deletion of your data anytime by
          emailing Manager@middlemanmerchants.com.
        </p>
      </div>
    </main>
  );
}
