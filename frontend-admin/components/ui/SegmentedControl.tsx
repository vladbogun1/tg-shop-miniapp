"use client";

import { motion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/cn";

export interface SegOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const layoutId = useId();
  return (
    <div
      className={cn(
        // max-w-full + own horizontal scroll: on a phone a wide control scrolls inside itself
        // instead of pushing the whole page sideways (B9).
        "thin-scroll inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-[3px]",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "font-display hit relative shrink-0 rounded-[var(--r-sm)] font-semibold uppercase tracking-[0.06em] transition-colors",
              size === "sm" ? "px-2.5 py-1 text-[11px] pointer-coarse:py-1.5" : "px-3.5 py-1.5 text-[12px] pointer-coarse:py-2",
              active ? "text-[var(--accent-hi)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${layoutId}`}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-[var(--r-sm)] border border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)]"
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
              {o.label}
              {o.count != null && (
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 text-[10.5px] leading-[16px]",
                    active ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--surface-3)] text-[var(--text-muted)]"
                  )}
                >
                  {o.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
