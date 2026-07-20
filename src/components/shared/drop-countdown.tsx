"use client";

import { useEffect, useState } from "react";

function getRemaining(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return false as const;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds };
}

export function DropCountdown({ endsAt }: { endsAt: string }) {
  // Deliberately starts as null on both server and first client render -
  // computing getRemaining(endsAt) at initial-state time would call
  // Date.now() during SSR and again during client hydration a moment
  // later, producing two different numbers and a hydration mismatch. The
  // real countdown is only computed client-side, after mount.
  const [remaining, setRemaining] = useState<ReturnType<typeof getRemaining> | null>(null);

  useEffect(() => {
    // Intentionally does not call setRemaining synchronously here (that
    // triggers an extra cascading render, flagged by
    // react-hooks/set-state-in-effect) - the first interval tick populates
    // the real countdown a moment after mount, replacing the "--"
    // placeholder below.
    const interval = setInterval(() => setRemaining(getRemaining(endsAt)), 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (remaining === null) {
    return (
      <div className="flex gap-4" role="timer" aria-live="polite" aria-label="Time remaining on this drop">
        {(["days", "hours", "minutes", "seconds"] as const).map((unit) => (
          <div key={unit} className="text-center">
            <div className="font-heading text-2xl font-semibold tabular-nums">--</div>
            <div className="text-xs uppercase text-muted-foreground">{unit}</div>
          </div>
        ))}
      </div>
    );
  }

  if (remaining === false) {
    return <p className="font-heading text-lg font-medium text-destructive">This drop has ended</p>;
  }

  return (
    <div className="flex gap-4" role="timer" aria-live="polite" aria-label="Time remaining on this drop">
      {(["days", "hours", "minutes", "seconds"] as const).map((unit) => (
        <div key={unit} className="text-center">
          <div className="font-heading text-2xl font-semibold tabular-nums">
            {String(remaining[unit]).padStart(2, "0")}
          </div>
          <div className="text-xs uppercase text-muted-foreground">{unit}</div>
        </div>
      ))}
    </div>
  );
}
