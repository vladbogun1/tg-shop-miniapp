"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search, X, Loader2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * Generic async autocomplete. Dropdown renders in a portal so it is never
 * clipped by ancestor overflow/stacking contexts.
 */
export function Autocomplete<T>({
  label,
  placeholder = "Поиск…",
  selectedLabel,
  fetchItems,
  itemLabel,
  itemSubLabel,
  itemKey,
  onSelect,
  onClear,
  className,
}: {
  label?: string;
  placeholder?: string;
  selectedLabel: string | null;
  fetchItems: (q: string) => Promise<T[]>;
  itemLabel: (item: T) => string;
  itemSubLabel?: (item: T) => string;
  itemKey: (item: T) => string;
  onSelect: (item: T) => void;
  onClear?: () => void;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (open && boxRef.current) setRect(boxRef.current.getBoundingClientRect());
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetchItems(q);
        if (alive) setItems(r);
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, 220);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open, fetchItems]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const reposition = () => {
      if (boxRef.current) setRect(boxRef.current.getBoundingClientRect());
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
      {label && <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</span>}

      {selectedLabel ? (
        <div className="flex h-11 items-center justify-between gap-2 rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--accent)] px-3.5">
          <span className="truncate text-[14px] font-bold text-[var(--accent-ink)]">{selectedLabel}</span>
          <button
            type="button"
            onClick={() => {
              onClear?.();
              setQ("");
            }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-[2px] text-[var(--accent-ink)] hover:bg-[var(--accent-ink)]/15"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          ref={boxRef}
          className={cn(
            "flex h-11 items-center gap-2 rounded-[var(--r-md)] border-[3px] bg-[var(--surface-2)] px-3 transition-colors",
            open ? "border-[var(--accent)] shadow-[var(--ring-accent)]" : "border-[var(--line)]"
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
          <input
            value={q}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--text-faint)]" />}
        </div>
      )}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && rect && !selectedLabel && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.14 }}
                style={{
                  position: "fixed",
                  top: rect.bottom + 6,
                  left: rect.left,
                  width: rect.width,
                  zIndex: 200,
                }}
                className="elevated thin-scroll max-h-72 overflow-auto p-1.5"
              >
                {items.length === 0 ? (
                  <div className="px-3 py-3 text-[13px] text-[var(--text-faint)]">
                    {loading ? "Поиск…" : "Ничего не найдено"}
                  </div>
                ) : (
                  items.map((it) => (
                    <button
                      key={itemKey(it)}
                      type="button"
                      onClick={() => {
                        onSelect(it);
                        setOpen(false);
                        setQ("");
                      }}
                      className="flex w-full flex-col items-start gap-0.5 rounded-[var(--r-sm)] px-3 py-2 text-left transition-colors hover:bg-[var(--surface-3)]"
                    >
                      <span className="truncate text-[14px] text-[var(--text)]">{itemLabel(it)}</span>
                      {itemSubLabel && (
                        <span className="truncate text-[12px] text-[var(--text-faint)]">{itemSubLabel(it)}</span>
                      )}
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
