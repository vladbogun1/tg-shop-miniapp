"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Empty / error state: a HUD-bracketed graphite block (DESIGN-V3 §4) with an orange-tinted icon tile. */
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
      className="hud-frame flex flex-col items-center justify-center gap-3 rounded-[var(--r-lg)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-6 py-14 text-center"
    >
      {Icon && (
        <div className="accent-tint grid h-12 w-12 place-items-center rounded-[var(--r-md)]">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div className="font-display text-[16px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">{title}</div>
      {description && (
        <div className="max-w-sm text-[13px] leading-relaxed text-[var(--text-muted)]">
          {description}
        </div>
      )}
      {action && <div className="mt-1">{action}</div>}
    </motion.div>
  );
}
