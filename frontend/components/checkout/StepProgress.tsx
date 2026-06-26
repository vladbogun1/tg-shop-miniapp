"use client";

/**
 * StepProgress — NEO-BRUTALISM segmented step indicator.
 *
 * Numbered bordered chips on a connecting rail. The active chip is accent-filled
 * and pops with a spring; done chips show a check; pending chips sit flat. A
 * thick ink rail connects the chips and fills with accent up to the active step.
 * Pure presentation — same props/behaviour as the original (steps + current).
 */
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { spring } from "@/lib/motion";

export function StepProgress({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  const count = steps.length;
  // 0..1 fraction of the rail filled — reaches the centre of the active chip.
  const fill = count > 1 ? Math.max(0, Math.min(1, current / (count - 1))) : 0;

  return (
    <div className="px-1 pt-1">
      {/* Rail + chips */}
      <div className="relative flex items-center justify-between">
        {/* Base rail (between first & last chip centres). */}
        <div className="absolute left-4 right-4 top-1/2 h-[3px] -translate-y-1/2 bg-[var(--line)]" />
        {/* Accent fill over the rail. */}
        <motion.div
          className="absolute left-4 top-1/2 h-[3px] -translate-y-1/2 origin-left bg-[var(--accent)]"
          style={{ right: 16 }}
          initial={false}
          animate={{ scaleX: fill }}
          transition={spring}
        />

        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          const on = done || active;
          return (
            <motion.span
              key={label}
              className="relative z-10 grid h-8 w-8 place-items-center rounded-[var(--r)] border-[3px] border-[var(--line)] text-[13px] font-black"
              initial={false}
              animate={{
                scale: active ? 1.12 : 1,
                y: active ? -1 : 0,
              }}
              transition={spring}
              style={{
                background: on ? "var(--accent)" : "var(--surface)",
                color: on ? "var(--accent-ink)" : "var(--muted)",
                boxShadow: active ? "3px 3px 0 var(--shadow)" : "none",
              }}
            >
              {done ? <Check className="h-4 w-4" strokeWidth={3.5} /> : i + 1}
            </motion.span>
          );
        })}
      </div>

      {/* Labels */}
      <div className="mt-2 flex items-start justify-between">
        {steps.map((label, i) => {
          const active = i === current;
          const done = i < current;
          return (
            <span
              key={label}
              className="flex-1 text-center text-[10px] font-bold uppercase leading-tight tracking-wide transition-colors"
              style={{
                color: active
                  ? "var(--ink)"
                  : done
                    ? "var(--muted)"
                    : "var(--faint)",
              }}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
