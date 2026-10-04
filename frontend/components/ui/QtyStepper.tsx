"use client";

/**
 * QtyStepper — ChiSetup quantity control (API unchanged: value, onChange,
 * min, max, size). Quiet −/+ squares around an Exo 2 count.
 */
import { Minus, Plus } from "lucide-react";
import { useT } from "@/i18n/context";

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
  const t = useT();
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
      className={`grid place-items-center rounded-[var(--r)] bg-[var(--surface-3)] text-[var(--ink)] transition-[transform,background-color] hover:bg-[#333336] active:scale-95 disabled:opacity-30 ${btn}`}
    >
      {children}
    </button>
  );

  return (
    <div className="inline-flex items-center gap-2 rounded-[calc(var(--r)+4px)] border border-[var(--line)] bg-[var(--surface-2)] p-1">
      <Btn label={t("qty.decrease")} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="h-4 w-4" strokeWidth={2.5} />
      </Btn>
      <span className={`font-display text-center font-bold tabular-nums text-[var(--ink)] ${num}`}>{value}</span>
      <Btn label={t("qty.increase")} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="h-4 w-4" strokeWidth={2.5} />
      </Btn>
    </div>
  );
}
