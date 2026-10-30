"use client";

/** QtyStepper — quantity control: −/+ buttons around the count. Подписи кнопок (a11y) даёт приложение. */
import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useUiLook } from "../look";

function StepButton({ onClick, disabled, children, label, className }: { onClick: () => void; disabled: boolean; children: ReactNode; label: string; className: string }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className={className}>
      {children}
    </button>
  );
}

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = "md",
  decreaseLabel,
  increaseLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  decreaseLabel: string;
  increaseLabel: string;
}) {
  const miniapp = useUiLook() === "miniapp";
  const btn = size === "sm" ? "h-9 w-9 min-h-0 min-w-0" : "h-11 w-11";
  const num = size === "sm" ? "min-w-[30px] text-[15px]" : "min-w-[40px] text-[17px]";
  const btnClass = miniapp
    ? `grid place-items-center rounded-[var(--r)] bg-[var(--surface-3)] text-[var(--ink)] transition-[transform,background-color] hover:bg-[#333336] active:scale-95 disabled:opacity-30 ${btn}`
    : `grid place-items-center rounded-[var(--r)] bg-[var(--surface-2)] text-[var(--ink)] transition-[transform,background-color,color] hover:bg-[var(--surface-3)] hover:text-[var(--accent-hi)] active:scale-[.94] disabled:opacity-30 disabled:hover:bg-[var(--surface-2)] disabled:hover:text-[var(--ink)] ${btn}`;

  return (
    <div
      className={
        miniapp
          ? "inline-flex items-center gap-2 rounded-[calc(var(--r)+4px)] border border-[var(--line)] bg-[var(--surface-2)] p-1"
          : "inline-flex items-center gap-1.5 rounded-[calc(var(--r)+4px)] border border-[var(--line-strong)] bg-[var(--surface)] p-1"
      }
    >
      <StepButton label={decreaseLabel} disabled={value <= min} onClick={() => onChange(value - 1)} className={btnClass}>
        <Minus className="h-4 w-4" strokeWidth={2.5} />
      </StepButton>
      <span className={`font-display text-center font-bold tabular-nums text-[var(--ink)] ${num}`}>{value}</span>
      <StepButton label={increaseLabel} disabled={value >= max} onClick={() => onChange(value + 1)} className={btnClass}>
        <Plus className="h-4 w-4" strokeWidth={2.5} />
      </StepButton>
    </div>
  );
}
