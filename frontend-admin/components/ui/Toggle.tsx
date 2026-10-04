"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer select-none items-center gap-3",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "focusable hit relative h-6 w-11 shrink-0 rounded-full border transition-[background-color,border-color,box-shadow] duration-200",
          checked
            ? "border-[var(--accent)] bg-[var(--accent)] shadow-[0_0_12px_rgba(255,102,0,.35)]"
            : "border-[var(--line-strong)] bg-[var(--surface-3)]"
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 600, damping: 32 }}
          className={cn(
            "absolute top-[2px] h-[18px] w-[18px] rounded-full shadow-[0_1px_3px_rgba(0,0,0,.5)]",
            checked ? "right-[2px] bg-white" : "left-[2px] bg-[var(--text-muted)]"
          )}
        />
      </button>
      {label && <span className="text-[14px] font-medium text-[var(--text)]">{label}</span>}
    </label>
  );
}
