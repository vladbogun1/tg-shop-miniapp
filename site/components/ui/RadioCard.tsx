"use client";

/**
 * RadioCard — selectable card (API unchanged: selected, onSelect, title, subtitle, icon, right).
 * Selected = orange border + soft orange fill + filled check.
 */
import { Check } from "lucide-react";
import type { ReactNode } from "react";

export function RadioCard({
  selected,
  onSelect,
  title,
  subtitle,
  icon,
  right,
}: {
  selected: boolean;
  onSelect: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
      className={`relative flex w-full items-center gap-3 rounded-[var(--r-card)] border p-4 text-left transition-[transform,border-color,background-color] active:scale-[.99] ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
      }`}
    >
      {icon && <span className={`shrink-0 ${selected ? "text-[var(--accent-hi)]" : "text-[var(--muted)]"}`}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[var(--ink)]">{title}</span>
        {subtitle && (
          <span className="mt-0.5 block text-[13px] font-medium text-[var(--muted)]">{subtitle}</span>
        )}
      </span>
      {right}
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border"
        style={{ background: selected ? "var(--accent)" : "transparent", borderColor: selected ? "var(--accent)" : "var(--line-strong)" }}
      >
        {selected && <Check className="h-4 w-4" strokeWidth={2.75} style={{ color: "var(--accent-ink)" }} />}
      </span>
    </button>
  );
}
