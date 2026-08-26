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
          If you use our mobile app and opt in to notifications, we collect a
          device push token so we can alert you when your order ships or a
          limited-time drop goes live. You can turn this off anytime in your
          device&apos;s notification settings.
        </p>
      </div>

      <h2 id="deleting-your-account" className="mt-10 text-2xl font-bold">
        Deleting Your Account
      </h2>
      <div className="mt-4 space-y-4 text-muted-foreground">
        <p>
          You can request deletion of your Sweet Shop account and personal
          data at any time by emailing{" "}
          <a
            href="mailto:Manager@middlemanmerchants.com?subject=Account%20Deletion%20Request"
            className="underline"
          >
            Manager@middlemanmerchants.com
          </a>{" "}
          with the subject line &quot;Account Deletion Request&quot; from the
          email address associated with your account. We&apos;ll confirm your
          identity and process the request within 30 days.
        </p>
        <p>
          <strong>What we delete:</strong> your profile, saved addresses,
          rewards and referral data, notification preferences, and any device
          push token on file.
        </p>
        <p>
          <strong>What we retain, and why:</strong> we keep records of
          completed transactions (order and payment history) for as long as
          required by law for tax, accounting, and fraud-prevention purposes,
          even after an account is deleted. This data is retained separately
          from your deleted profile and is not used for any other purpose.
        </p>
        <p>
          You can also request access to a copy of your data, or deletion of
          specific pieces of it without deleting your whole account, using
          the same email address above.
        </p>
      </div>
    </main>
  );
}
