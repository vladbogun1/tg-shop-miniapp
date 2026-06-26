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
        "inline-flex items-center gap-1 rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface-2)] p-1",
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
              "relative rounded-[var(--r-sm)] font-bold uppercase tracking-wide transition-colors",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-[12px]",
              active ? "text-[var(--accent-ink)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${layoutId}`}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-[var(--r-sm)] bg-[var(--accent)]"
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
              {o.label}
              {o.count != null && (
                <span
                  className={cn(
                    "rounded-[2px] px-1.5 text-[11px]",
                    active ? "bg-[var(--accent-ink)]/15 text-[var(--accent-ink)]" : "bg-[var(--surface-3)] text-[var(--text-faint)]"
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
