"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface CopyReferralLinkProps {
  link: string;
}

export function CopyReferralLink({ link }: CopyReferralLinkProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser (insecure context,
      // permission denied, etc.) - the input field itself is still
      // select-on-focus, so manual copy always works as a fallback.
    }
  }

  return (
    <div className="flex gap-2">
      <Input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
      <Button type="button" variant="outline" onClick={handleCopy}>
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  );
}
