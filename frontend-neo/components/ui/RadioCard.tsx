"use client";

/**
 * RadioCard — NEO-BRUTALISM selectable card (API unchanged: selected, onSelect,
 * title, subtitle, icon, right). Selected = accent border + hard shadow + filled
 * check box. Sharp corners, press feedback.
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
      aria-pressed={selected}
      className="relative flex w-full items-center gap-3 rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] p-4 text-left transition-transform active:translate-x-[3px] active:translate-y-[3px]"
      style={{
        boxShadow: selected ? "5px 5px 0 var(--accent)" : "5px 5px 0 var(--shadow)",
      }}
    >
      {icon && <span className="shrink-0 text-[var(--ink)]">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold text-[var(--ink)]">{title}</span>
        {subtitle && (
          <span className="mt-0.5 block text-[13px] font-medium text-[var(--muted)]">{subtitle}</span>
        )}
      </span>
      {right}
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-[3px] border-[2.5px] border-[var(--line)]"
        style={{ background: selected ? "var(--accent)" : "transparent" }}
      >
        {selected && <Check className="h-4 w-4" strokeWidth={3.5} style={{ color: "var(--accent-ink)" }} />}
      </span>
    </button>
  );
}
