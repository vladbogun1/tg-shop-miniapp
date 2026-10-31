"use client";

/**
 * StepProgress — compact ChiSetup step indicator for the checkout header.
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
import { useT } from "@/i18n/context";
import { spring } from "@/lib/motion";

export function StepProgress({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  const t = useT();
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="font-display truncate text-[17px] font-extrabold uppercase leading-tight tracking-[0.04em] text-[var(--ink)]">
          {steps[current] ?? ""}
        </h1>
        <span className="font-display shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)] tabular-nums">
          {t("checkout.stepCounter", { current: current + 1, total: steps.length })}
        </span>
      </div>

      <div className="mt-1.5 flex gap-1">
        {steps.map((label, i) => (
          <motion.span
            key={label}
            aria-hidden
            className="h-[3px] flex-1 rounded-full"
            style={{ boxShadow: i === current ? "0 0 8px rgba(255,102,0,.6)" : "none" }}
            initial={false}
            animate={{ backgroundColor: i <= current ? "#FF6600" : "#2A2A2D" }}
            transition={spring}
          />
        ))}
      </div>
    </div>
  );
}
