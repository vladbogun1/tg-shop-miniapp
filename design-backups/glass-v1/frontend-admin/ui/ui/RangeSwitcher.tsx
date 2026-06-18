"use client";

/**
 * RangeSwitcher — glass segmented control for the time range
 * (Месяц / Полгода / Год / Всё). Used on the board and metrics views.
 */
import { motion } from "framer-motion";
import type { TimeRange } from "@/lib/api";
import { RANGE_OPTIONS } from "@/lib/range";

interface Props {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
  className?: string;
}

export function RangeSwitcher({ value, onChange, className }: Props) {
  return (
    <div
      className={`glass inline-flex items-center gap-1 rounded-[var(--r-pill)] p-1 ${
        className ?? ""
      }`}
    >
      {RANGE_OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="relative rounded-[var(--r-pill)] px-3.5 py-1.5 text-[13px] font-medium transition-colors"
          >
            {active && (
              <motion.span
                layoutId="range-active"
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
                className="absolute inset-0 rounded-[var(--r-pill)] [background:var(--accent)]"
              />
            )}
            <span
              className={`relative z-10 ${
                active ? "text-[var(--accent-ink)]" : "text-[var(--text-muted)]"
              }`}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
