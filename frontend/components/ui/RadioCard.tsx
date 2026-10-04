"use client";

/**
 * RadioCard — ChiSetup selectable card (API unchanged: selected, onSelect,
 * title, subtitle, icon, right). Selected = orange border + soft glow + filled check.
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
      className="relative flex w-full items-center gap-3 rounded-[var(--r-card)] border p-4 text-left transition-[transform,border-color,box-shadow,background-color] duration-150 active:scale-[.99]"
      style={{
        background: selected
          ? "linear-gradient(0deg, var(--accent-soft), var(--accent-soft)), var(--surface)"
          : "var(--surface)",
        borderColor: selected ? "var(--accent)" : "var(--line)",
        boxShadow: selected ? "0 0 22px -6px rgba(255,102,0,.45)" : "0 8px 24px -12px var(--shadow)",
      }}
    >
      {icon && <span className={`shrink-0 ${selected ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="font-display block text-[15px] font-bold text-[var(--ink)]">{title}</span>
        {subtitle && (
          <span className="mt-0.5 block text-[13px] text-[var(--muted)]">{subtitle}</span>
        )}
      </span>
      {right}
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-[1.5px]"
        style={{
          background: selected ? "var(--accent)" : "transparent",
          borderColor: selected ? "var(--accent)" : "var(--line-strong)",
        }}
      >
        {selected && <Check className="h-3.5 w-3.5" strokeWidth={3.5} style={{ color: "var(--accent-ink)" }} />}
      </span>
    </button>
  );
}
