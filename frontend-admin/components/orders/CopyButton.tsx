"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";

/** Copies text to the clipboard; works in the Telegram WebView too (textarea fallback). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Small square "copy" button; shows a check for a moment after copying. */
export function CopyButton({
  value,
  label = "Скопировать",
  className,
}: {
  value: string | null | undefined;
  /** Accessible name / tooltip, e.g. "Скопировать телефон". */
  label?: string;
  className?: string;
}) {
  const { push } = useToast();
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={async (e) => {
        e.stopPropagation();
        if (await copyText(value)) {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } else {
          push("Не удалось скопировать", "error");
        }
      }}
      className={cn(
        "nb-press grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] transition-colors hover:bg-[var(--surface-3)]",
        className
      )}
    >
      {done ? <Check className="h-3.5 w-3.5 text-[var(--ok)]" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
