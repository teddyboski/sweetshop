"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ShopError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-24 text-center">
      <h1 className="font-heading text-xl font-semibold">Something went wrong loading the shop</h1>
      <p className="text-muted-foreground">Please try again in a moment.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
