"use client";

/** Square icon button that copies a value (TTN etc.) and flashes a check mark. */
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useT } from "@/i18n/context";
import { copyText } from "@/lib/hooks";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(value)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }
      }}
      aria-label={t("common.copy", { label })}
      title={copied ? t("common.copied") : t("common.copy", { label })}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-hi)]"
    >
      {copied ? <Check className="h-4 w-4 text-[var(--ok)]" strokeWidth={2.5} /> : <Copy className="h-4 w-4" strokeWidth={2.5} />}
    </button>
  );
}
