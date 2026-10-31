"use client";

import { cn } from "@/lib/cn";

/** Крупная радио-кнопка модалок оплаты и возврата: подпись слева, сумма справа. */
export function RadioOption({ selected, label, sub, onSelect }: { selected: boolean; label: string; sub?: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "nb-press flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--r-md)] border px-3.5 py-2.5 text-left transition-colors",
        selected ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]"
      )}
    >
      <span className="flex items-center gap-2.5 text-[14px] font-semibold text-[var(--text)]">
        <span
          aria-hidden
          className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border", selected ? "border-[var(--accent)]" : "border-[var(--line-strong)]")}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
        </span>
        {label}
      </span>
      {sub && <span className={cn("font-display tabular text-[15px] font-bold", selected ? "text-[var(--accent-hi)]" : "text-[var(--text)]")}>{sub}</span>}
    </button>
  );
}
