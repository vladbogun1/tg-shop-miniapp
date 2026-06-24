"use client";

/**
 * QtyStepper — NEO-BRUTALISM quantity control (API unchanged: value, onChange,
 * min, max, size). Sharp bordered −/+ squares around the count.
 */
import { Minus, Plus } from "lucide-react";

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = "md",
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
}) {
  const btn = size === "sm" ? "h-9 w-9 min-h-0 min-w-0" : "h-11 w-11";
  const num = size === "sm" ? "min-w-[30px] text-[15px]" : "min-w-[40px] text-[17px]";

  const Btn = ({
    onClick,
    disabled,
    children,
    label,
  }: {
    onClick: () => void;
    disabled: boolean;
    children: React.ReactNode;
    label: string;
  }) => (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] transition-transform active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-30 ${btn}`}
    >
      {children}
    </button>
  );

  return (
    <div className="inline-flex items-center gap-2 rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface)] p-1">
      <Btn label="Уменьшить" disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="h-4 w-4" strokeWidth={3} />
      </Btn>
      <span className={`text-center font-black tabular-nums text-[var(--ink)] ${num}`}>{value}</span>
      <Btn label="Увеличить" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="h-4 w-4" strokeWidth={3} />
      </Btn>
    </div>
  );
}
