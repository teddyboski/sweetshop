import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Smartphone, Globe } from "lucide-react";

export const metadata: Metadata = {
  title: "Get The Sweet Shop | Android App & Website",
  description: "Get The Sweet Shop on your Android phone, or shop from your browser.",
};

// Milestone 20: a stable, permanent QR-code landing target
// (sweetshopcentral.com/app) for a printed sticker. The sticker itself
// can never be reprinted cheaply if the destination changes, so this
// page - not a specific EAS build link - is what the QR code points to.
// Only this file needs updating when the app changes; the sticker never
// does.
//
// ANDROID_APP_URL is tied to a specific EAS build (distribution:
// "internal" - no Play Store, no login required to install). It only
// needs to change when there's a brand new NATIVE build (a new native
// dependency, changed app icon/splash, changed permissions) - ordinary
// JS-only updates reach already-installed phones automatically via EAS
// Update's OTA channel and never require touching this link. If a new
// native build ever ships, update this one constant and redeploy - the
// QR code / sticker itself keeps working unchanged.
const ANDROID_APP_URL =
  "https://expo.dev/accounts/sweetshop/projects/sweetshop-1/builds/2477f851-9c86-4f0f-8382-dc456fd65ac3";

export default function GetAppPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-16 text-center">
      <Image src="/logo-mark.svg" alt="" width={64} height={64} className="h-16 w-16" priority />
      <h1 className="mt-6 font-heading text-3xl font-bold">Get The Sweet Shop</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        Shop from the Android app, or from your browser — whichever you&apos;d rather use.
      </p>

      <div className="mt-10 grid w-full gap-4 sm:grid-cols-2">
        <a
          href={ANDROID_APP_URL}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col items-center gap-3 rounded-lg border p-6 transition-colors hover:bg-muted"
        >
          <Smartphone className="size-8 text-primary" aria-hidden="true" />
          <span className="font-medium">Get the App</span>
          <span className="text-sm text-muted-foreground">Android only, for now</span>
        </a>
        <Link
          href="/"
          className="flex flex-col items-center gap-3 rounded-lg border p-6 transition-colors hover:bg-muted"
        >
          <Globe className="size-8 text-primary" aria-hidden="true" />
          <span className="font-medium">Visit the Website</span>
          <span className="text-sm text-muted-foreground">Works on any device</span>
        </Link>
      </div>
    </main>
  );
}
