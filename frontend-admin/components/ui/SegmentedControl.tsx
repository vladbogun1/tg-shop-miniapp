"use client";

import { motion } from "framer-motion";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface SegOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

const FADE = 20;

/**
 * When the control scrolls inside itself: fade the edge that hides more options (a cut «Н…» with no hint read
 * as a broken control) and keep the active option in view.
 */
function useScrollHints(ref: RefObject<HTMLDivElement | null>, value: string) {
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    const btn = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !btn) return;
    const l = btn.offsetLeft;
    const r = l + btn.offsetWidth;
    if (l < el.scrollLeft) el.scrollLeft = l - FADE;
    else if (r > el.scrollLeft + el.clientWidth) el.scrollLeft = r - el.clientWidth + FADE;
  }, [ref, value]);
  if (!edges.left && !edges.right) return undefined;
  const mask = `linear-gradient(to right, ${edges.left ? "transparent" : "#000"} 0, #000 ${FADE}px, #000 calc(100% - ${FADE}px), ${edges.right ? "transparent" : "#000"} 100%)`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const layoutId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const fade = useScrollHints(ref, value);
  return (
    <div
      ref={ref}
      style={fade}
      className={cn(
        // max-w-full + own horizontal scroll: on a phone a wide control scrolls inside itself
        // instead of pushing the whole page sideways (B9).
        "thin-scroll relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-[3px]",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "font-display hit relative shrink-0 rounded-[var(--r-sm)] font-semibold uppercase tracking-[0.06em] transition-colors",
              size === "sm" ? "px-2.5 py-1 text-[11px] pointer-coarse:py-1.5" : "px-3.5 py-1.5 text-[12px] pointer-coarse:py-2",
              active ? "text-[var(--accent-hi)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${layoutId}`}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-[var(--r-sm)] border border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)]"
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
              {o.label}
              {o.count != null && (
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 text-[10.5px] leading-[16px]",
                    active ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--surface-3)] text-[var(--text-muted)]"
                  )}
                >
                  {o.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
