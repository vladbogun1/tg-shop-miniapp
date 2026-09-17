"use client";

/**
 * StepProgress — compact NEO-BRUTALISM step indicator for the checkout header.
 *
 * It used to be a full-width bordered card with 32px numbered chips, a connecting rail and a
 * caption under every step. Together with the separate title row it ate roughly a sixth of a
 * phone screen before the customer saw a single field — and on the delivery step that is exactly
 * the space the map and the "Выбрать отделение" button need. Now it is one line (current step
 * name + counter) over a thin segmented rail, and it sits inside the header row next to the back
 * button.
 *
 * Same props as before: the list of steps and the current index.
 */
import { motion } from "framer-motion";
import { spring } from "@/lib/motion";

export function StepProgress({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="truncate text-[17px] font-black uppercase leading-tight tracking-wide text-[var(--ink)]">
          {steps[current] ?? ""}
        </h1>
        <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-[var(--faint)]">
          Шаг {current + 1}/{steps.length}
        </span>
      </div>

      <div className="mt-1.5 flex gap-1">
        {steps.map((label, i) => (
          <motion.span
            key={label}
            aria-hidden
            className="h-[7px] flex-1 border-[2px] border-[var(--line)]"
            initial={false}
            animate={{ backgroundColor: i <= current ? "var(--accent)" : "var(--surface)" }}
            transition={spring}
          />
        ))}
      </div>
    </div>
  );
}
