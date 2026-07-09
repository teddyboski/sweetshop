import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact The Sweet Shop",
  description: "Get in touch with The Sweet Shop — we usually reply within 1 business day.",
};

export default function Contact() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">Questions? We&apos;ve got you.</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Email{" "}
        <a href="mailto:Manager@middlemanmerchants.com" className="underline">
          Manager@middlemanmerchants.com
        </a>{" "}
        — we usually reply within 1 business day. Or catch us live on Whatnot
        and ask right there.
      </p>
    </main>
  );
}
