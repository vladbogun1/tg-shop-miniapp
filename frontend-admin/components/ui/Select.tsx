"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Where a fixed dropdown under `rect` goes: below the field (up to 288px tall), or above it when
 * the field sits low on the screen (phone keyboard, last field of a modal) and there is more room
 * there — so the list never runs past the screen edge. Shared with Autocomplete.
 */
export function menuPlacement(rect: DOMRect): { top?: number; bottom?: number; maxHeight: number } {
  const MAX = 288;
  const vh = window.innerHeight;
  const below = vh - rect.bottom - 12;
  const above = rect.top - 12;
  if (below < Math.min(MAX, 200) && above > below) {
    return { bottom: vh - rect.top + 6, maxHeight: Math.min(MAX, above - 6) };
  }
  return { top: rect.bottom + 6, maxHeight: Math.max(120, Math.min(MAX, below - 6)) };
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  placeholder = "Выбрать…",
}: {
  label?: string;
  value: T | "";
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const reposition = () => {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && <span className="field-label">{label}</span>}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "focusable flex h-10 items-center justify-between gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[14px] transition-[border-color,box-shadow] duration-150 hover:border-[var(--border-2)] pointer-coarse:h-11",
          open && "!border-[var(--accent)] shadow-[var(--ring-accent)]"
        )}
      >
        <span className={cn("min-w-0 truncate", selected ? "text-[var(--text)]" : "text-[var(--text-faint)]")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform", open && "rotate-180")}
        />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && rect && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                style={{
                  position: "fixed",
                  ...menuPlacement(rect),
                  left: rect.left,
                  width: rect.width,
                  zIndex: 200,
                }}
                className="elevated thin-scroll overflow-auto p-1"
              >
                {options.map((o) => {
                  const active = o.value === value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-[var(--r-sm)] px-3 py-2 text-left text-[14px] transition-colors",
                        active
                          ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-hi)]"
                          : "text-[var(--text)] hover:bg-[var(--surface-2)]"
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {active && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
