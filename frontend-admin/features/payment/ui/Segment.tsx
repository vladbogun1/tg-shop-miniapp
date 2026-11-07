"use client";

import { cn } from "@/lib/cn";

/** Плитка-сегмент модалок оплаты и возврата: подпись и сумма. Крупная цель касания, `aria-pressed`. */
export function Segment({ selected, label, sub, onClick }: { selected: boolean; label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "nb-press flex min-h-12 min-w-0 flex-1 basis-[7.5rem] flex-col items-start justify-center rounded-[var(--r-md)] border px-3 py-2 text-left transition-colors",
        selected
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--line-strong)]"
      )}
    >
      <span className="text-[13px] font-semibold leading-tight">{label}</span>
      {sub && <span className="font-display tabular text-[14px] font-bold leading-tight">{sub}</span>}
    </button>
  );
}
