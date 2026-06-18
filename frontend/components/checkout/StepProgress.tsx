"use client";

/** Glass step progress indicator (design doc §6bis.1: "стеклянный степпер"). */
import { motion } from "framer-motion";
import { Check } from "lucide-react";

export function StepProgress({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-center">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition-colors"
                style={{
                  background:
                    done || active ? "var(--accent)" : "var(--glass-bg)",
                  color:
                    done || active ? "var(--accent-ink)" : "var(--text-muted)",
                  boxShadow: active
                    ? "0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent)"
                    : undefined,
                }}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {i < steps.length - 1 && (
                <span className="relative mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-white/12">
                  <motion.span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ background: "var(--accent)" }}
                    initial={false}
                    animate={{ width: done ? "100%" : "0%" }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                </span>
              )}
            </div>
            <span
              className="text-center text-[10px] font-medium leading-tight"
              style={{
                color: active ? "var(--text)" : "var(--text-faint)",
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
