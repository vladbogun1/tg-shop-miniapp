"use client";

import { cn } from "@/lib/cn";
import { STEPS } from "../../model/steps";

/**
 * Progress header — a segmented bar (fits any width, no horizontal overflow) plus
 * the CURRENT step's name + counter. Segments are tappable to jump back/forward.
 */
export function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          // A taller tap area around a thin 4px bar: passed = dim orange, current = orange with glow.
          <button
            key={s.key}
            type="button"
            onClick={() => onJump(i)}
            aria-label={`Шаг ${i + 1}: ${s.label}`}
            aria-current={i === step ? "step" : undefined}
            title={s.label}
            className="focusable group flex h-4 flex-1 items-center rounded-full pointer-coarse:h-10"
          >
            <span
              className={cn(
                "h-1 w-full rounded-full transition-[background-color,box-shadow] duration-200",
                i < step
                  ? "bg-[rgba(255,102,0,.45)] group-hover:bg-[rgba(255,102,0,.6)]"
                  : i === step
                    ? "bg-[var(--accent)] shadow-[var(--glow-sm)]"
                    : "bg-[var(--surface-3)] group-hover:bg-[var(--border-2)]"
              )}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="section-title min-w-0 truncate !text-[15px] text-[var(--ink)]">
          {step + 1}. {STEPS[step].label}
        </span>
        <span className="font-display tabular shrink-0 text-[12px] font-semibold tracking-[0.06em] text-[var(--text-faint)]">
          {step + 1}/{STEPS.length}
        </span>
      </div>
    </div>
  );
}
