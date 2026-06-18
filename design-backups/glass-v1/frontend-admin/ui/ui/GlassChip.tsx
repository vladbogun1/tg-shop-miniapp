"use client";

/** GlassChip — glass pill for filters / tags. Active = accent fill. */
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  className?: string;
}

export function GlassChip({ children, active, onClick, icon, className }: Props) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-[var(--r-pill)] px-3.5 py-2 text-[13px] font-medium transition-colors ${
        active
          ? "text-[var(--accent-ink)] [background:var(--accent)]"
          : "glass text-[var(--text-muted)]"
      } ${className ?? ""}`}
    >
      {icon}
      {children}
    </motion.button>
  );
}
