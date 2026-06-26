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
          "focusable relative h-7 w-12 shrink-0 rounded-[var(--r-sm)] border-[3px] border-[var(--line)] transition-colors duration-200",
          checked ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]"
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 600, damping: 32 }}
          className={cn(
            "absolute top-[1px] h-[19px] w-[19px] rounded-[1px] border-[2px] border-[var(--line)]",
            checked ? "right-[1px] bg-[var(--accent-ink)]" : "left-[1px] bg-[var(--surface)]"
          )}
        />
      </button>
      {label && <span className="text-[14px] font-semibold text-[var(--text)]">{label}</span>}
    </label>
  );
}
