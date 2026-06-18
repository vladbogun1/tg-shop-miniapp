"use client";

/**
 * GlassSelect — custom dropdown (design doc §8.4 "ne nativnyy <select>").
 * Glass menu, keyboard-free click selection, floating label.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface Option {
  value: string;
  label: string;
}

interface Props {
  label?: string;
  value: string | null;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function GlassSelect({
  label,
  value,
  options,
  onChange,
  className,
  placeholder = "Выбрать…",
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="glass flex w-full items-center justify-between gap-2 rounded-[var(--r-md)] px-4 py-3 text-left text-[15px] text-[var(--text)] outline-none"
      >
        <span className="flex flex-col">
          {label && (
            <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
          )}
          <span className={selected ? "" : "text-[var(--text-faint)]"}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="glass glass--floating thin-scroll absolute z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-[var(--r-md)] p-1.5"
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-[var(--r-sm)] px-3 py-2.5 text-left text-[14px] text-[var(--text)] transition-colors hover:bg-white/10"
              >
                {o.label}
                {o.value === value && (
                  <Check className="h-4 w-4 text-[var(--accent)]" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
