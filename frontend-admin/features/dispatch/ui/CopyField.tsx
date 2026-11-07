"use client";

import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { copyText } from "@/components/ui/CopyButton";
import { cn } from "@/lib/cn";
import { toast } from "@shop/ui/toast";

/**
 * One field of the Nova Poshta form. A tap on the value copies it (the check icon confirms); `extra` is
 * a second control beside it (the phone's «позвонить» link). `min-h-11`: a finger-sized target.
 */
export function CopyField({
  icon,
  label,
  value,
  mono,
  noCopy,
  wrap,
  extra,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  noCopy?: boolean;
  /** Wrap instead of «…»: the branch / parcel-locker number sits at the very end of the name. */
  wrap?: boolean;
  extra?: ReactNode;
}) {
  const [done, setDone] = useState(false);
  const copyable = !noCopy && value !== "—";

  async function copy() {
    if (await copyText(value)) {
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } else {
      toast.error("Не удалось скопировать");
    }
  }

  const body = (
    <>
      <span className="shrink-0 text-[var(--text-muted)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="font-display block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">{label}</span>
        <span
          className={cn("block text-[14px] font-semibold text-[var(--text)]", wrap ? "break-words leading-snug" : "truncate", mono && "tabular")}
          title={value}
        >
          {value}
        </span>
      </span>
      {copyable && (done ? <Check className="h-4 w-4 shrink-0 text-[var(--ok)]" /> : <Copy className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />)}
    </>
  );

  return (
    <div className="card-2 flex min-h-11 min-w-0 items-center gap-1 pr-1.5">
      {copyable ? (
        <button
          type="button"
          onClick={copy}
          title={`Скопировать: ${label.toLowerCase()}`}
          aria-label={`Скопировать: ${label.toLowerCase()} — ${value}`}
          className="focusable flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[var(--r-sm)] py-1.5 pl-3 pr-1 text-left"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 py-1.5 pl-3 pr-1">{body}</div>
      )}
      {extra}
    </div>
  );
}
