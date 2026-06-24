"use client";

/**
 * GlassChip — NEO-BRUTALISM pill/chip (API unchanged: children, active, onClick,
 * icon). Active = solid accent fill. Thick border, press feedback.
 */
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
}

export function GlassChip({ children, active, onClick, icon }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--r)] border-[2.5px] border-[var(--line)] px-3.5 py-2 text-[13px] font-bold transition-transform active:translate-x-[2px] active:translate-y-[2px] ${
        active ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--surface)] text-[var(--ink)]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
