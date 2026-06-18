"use client";

/**
 * QtyStepper — glass quantity control (−  N  +). Custom, ≥44px targets.
 * Clamps between min and max; disables buttons at bounds.
 */
import { motion } from "framer-motion";
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
  const btn =
    size === "sm"
      ? "h-9 w-9 min-h-0 min-w-0"
      : "h-11 w-11";
  const num = size === "sm" ? "min-w-[28px] text-[14px]" : "min-w-[36px] text-[16px]";

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
    <motion.button
      type="button"
      aria-label={label}
      whileTap={{ scale: 0.9 }}
      disabled={disabled}
      onClick={onClick}
      className={`tap flex items-center justify-center rounded-[var(--r-pill)] text-[var(--text)] transition-opacity disabled:opacity-30 ${btn}`}
    >
      {children}
    </motion.button>
  );

  return (
    <div className="glass inline-flex items-center rounded-[var(--r-pill)] px-1">
      <Btn label="Уменьшить" disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="h-4 w-4" />
      </Btn>
      <span className={`text-center font-semibold text-[var(--text)] ${num}`}>
        {value}
      </span>
      <Btn label="Увеличить" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="h-4 w-4" />
      </Btn>
    </div>
  );
}
