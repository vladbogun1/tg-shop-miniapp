"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { CountUp } from "./CountUp";
import { riseItem } from "@/lib/motion";

export function StatCard({
  label,
  value,
  rawValue,
  format,
  icon: Icon,
  accent,
  hint,
  className,
}: {
  label: string;
  /** Pre-formatted string value (used when rawValue is not numeric). */
  value?: string;
  /** Numeric value → animated count-up. */
  rawValue?: number;
  format?: (n: number) => string;
  icon?: LucideIcon;
  accent?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <motion.div
      variants={riseItem}
      className={cn("card relative overflow-hidden p-5", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="field-label">{label}</div>
        {Icon && (
          <div
            className="grid h-9 w-9 place-items-center rounded-[var(--r-md)]"
            style={{
              color: accent ?? "var(--accent-hi)",
              backgroundColor: `color-mix(in srgb, ${accent ?? "var(--accent)"} 14%, transparent)`,
            }}
          >
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
      </div>
      <div className="kpi-num mt-3 text-[28px]">
        {rawValue != null ? <CountUp value={rawValue} format={format} /> : value}
      </div>
      {hint && <div className="mt-2 text-[12px] text-[var(--text-faint)]">{hint}</div>}
    </motion.div>
  );
}
