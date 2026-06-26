"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border-[3px] border-dashed border-[var(--line)] px-6 py-16 text-center"
    >
      {Icon && (
        <div className="grid h-14 w-14 place-items-center rounded-[var(--r-sm)] border-[3px] border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[4px_4px_0_var(--shadow)]">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <div className="text-[16px] font-extrabold uppercase tracking-wide text-[var(--text)]">{title}</div>
      {description && (
        <div className="max-w-sm text-[13px] leading-relaxed text-[var(--text-muted)]">
          {description}
        </div>
      )}
      {action && <div className="mt-1">{action}</div>}
    </motion.div>
  );
}
