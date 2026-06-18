"use client";

/**
 * GlassChip — glass pill for filters / variants / tags (design doc §8.4).
 * Active = accent fill. Custom control, no default styling.
 */
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
}

export function GlassChip({ children, active, onClick, icon }: Props) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onClick={onClick}
      className={`tap inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--r-pill)] px-3.5 py-2 text-[13px] font-medium transition-colors ${
        active ? "glossy" : "glass text-[var(--text-muted)]"
      }`}
    >
      {icon}
      {children}
    </motion.button>
  );
}
