"use client";

/**
 * Underline tabs (WAI-ARIA tablist): ←/→/Home/End move between tabs, the orange 2px underline
 * slides to the active one. The panels are the caller's — render the one for `value`.
 */
import { useId, useRef } from "react";
import { cn } from "@/lib/cn";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function move(i: number) {
    const n = (i + items.length) % items.length;
    onChange(items[n].value);
    refs.current[n]?.focus();
  }

  return (
    <div role="tablist" className={cn("thin-scroll flex gap-1 overflow-x-auto border-b border-[var(--line)]", className)}>
      {items.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-${t.value}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(i + 1);
              else if (e.key === "ArrowLeft") move(i - 1);
              else if (e.key === "Home") move(0);
              else if (e.key === "End") move(items.length - 1);
            }}
            className={cn(
              "font-display focusable relative flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-1.5 text-[12.5px] font-semibold uppercase tracking-[0.06em] transition-colors",
              active ? "text-[var(--accent-hi)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            {t.label}
            {t.count != null && (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-[10.5px] leading-[16px]",
                  active ? "bg-[var(--accent-soft-2)] text-[var(--accent-hi)]" : "bg-[var(--surface-3)] text-[var(--text-muted)]"
                )}
              >
                {t.count}
              </span>
            )}
            {/* Plain CSS, not a framer `layoutId`: a shared-layout element inside a Modal kept the
                Modal's exit from finishing after a tab switch (framer-motion 11.18) — an invisible
                dialog stayed on top of the page and swallowed every click. */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-1 -bottom-px h-[2px] rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)] transition-[opacity,transform] duration-200",
                active ? "opacity-100 scale-x-100" : "opacity-0 scale-x-50"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
