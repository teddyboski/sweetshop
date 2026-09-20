import type { Metadata } from "next";
import Link from "next/link";
import { SCAN_OFFER_CODE } from "@/lib/promotions/scan-offer";

export const metadata: Metadata = {
  title: "15% off your first order | The Sweet Shop",
  description: "Create an account and get 15% off your first order at The Sweet Shop.",
  robots: { index: false, follow: false },
};

const STEPS = [
  "Create your free account.",
  "Confirm your email, then log in.",
  "Shop — your 15% comes off at checkout automatically.",
];

export default function ScanOfferPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">Welcome</p>
      <h1 className="mt-2 text-4xl font-bold">15% off your first order</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Thanks for scanning! Sign up and your discount is applied for you — there&apos;s no code to type.
      </p>

      <ol className="mx-auto mt-8 max-w-sm space-y-3 text-left">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <Link
        href={`/signup?offer=${SCAN_OFFER_CODE}`}
        className="mt-10 inline-block rounded-md bg-primary px-6 py-3 text-primary-foreground"
      >
        Create my account
      </Link>

      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        New accounts only, on your first order · one use per customer.
      </p>
    </div>
  );
}
