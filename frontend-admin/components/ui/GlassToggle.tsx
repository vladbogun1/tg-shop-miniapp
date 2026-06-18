"use client";

/** GlassToggle — custom pill toggle (design doc §8.4 "kastomnye pilyuli"). */
import { motion } from "framer-motion";

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export function GlassToggle({ checked, onChange, label }: Props) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 text-[14px] text-[var(--text)]"
    >
      <span
        className={`relative flex h-6 w-11 items-center rounded-[var(--r-pill)] px-0.5 transition-colors ${
          checked ? "[background:var(--accent)]" : "glass"
        }`}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={`h-5 w-5 rounded-full bg-white shadow ${checked ? "ml-auto" : ""}`}
        />
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}
