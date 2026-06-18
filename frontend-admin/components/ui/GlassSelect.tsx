"use client";

/**
 * GlassSelect — custom dropdown (design doc §8.4 "ne nativnyy <select>").
 * Glass menu, keyboard-free click selection, floating label.
 *
 * The menu is rendered in a PORTAL (fixed-positioned over <body>) so it never
 * gets clipped or covered by sibling glass cards — each .glass element creates
 * its own stacking context (backdrop-filter + transform), so an in-card
 * absolute menu can't paint above a later sibling card. The portal escapes that.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const reposition = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 8, left: r.left, width: r.width });
  };

  // Position the menu when it opens.
  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  // Close on outside click (button OR portal menu), and on scroll/resize.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
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
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && rect && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16 }}
                style={{ top: rect.top, left: rect.left, width: rect.width }}
                className="glass glass--floating thin-scroll fixed z-[200] max-h-64 overflow-y-auto rounded-[var(--r-md)] p-1.5"
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
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
