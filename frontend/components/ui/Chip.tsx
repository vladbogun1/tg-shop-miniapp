"use client";

/**
 * Chip — ChiSetup pill (API unchanged: children, active, onClick, icon).
 * Active = soft orange fill + orange border (`.nb-chip-active`).
 */
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
}

export function Chip({ children, active, onClick, icon }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`nb-chip nb-press tap inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-[13px] ${
        active ? "nb-chip-active" : ""
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
