"use client";

/**
 * RadioCard — glass selectable card (custom radio, no native input).
 * Used for delivery method & payment option selection. ≥44px target.
 */
import { motion } from "framer-motion";
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
    <motion.button
      type="button"
      whileTap={{ scale: 0.985 }}
      onClick={onSelect}
      aria-pressed={selected}
      className="glass relative flex w-full items-center gap-3 rounded-[var(--r-md)] p-4 text-left transition-shadow"
      style={
        selected
          ? { boxShadow: "inset 0 0 0 1.5px var(--accent), var(--shadow-1)" }
          : undefined
      }
    >
      {icon && (
        <span className="shrink-0 text-[var(--accent)]">{icon}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[var(--text)]">
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block text-[13px] text-[var(--text-muted)]">
            {subtitle}
          </span>
        )}
      </span>
      {right}
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors"
        style={{
          borderColor: selected ? "var(--accent)" : "var(--glass-stroke)",
          background: selected ? "var(--accent)" : "transparent",
        }}
      >
        {selected && (
          <Check className="h-4 w-4" style={{ color: "var(--accent-ink)" }} />
        )}
      </span>
    </motion.button>
  );
}
