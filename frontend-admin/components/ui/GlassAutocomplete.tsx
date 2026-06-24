"use client";

/**
 * GlassAutocomplete (admin) — debounced async combobox with a PORTAL dropdown
 * (fixed-positioned over <body>) so it's never clipped/covered by sibling glass
 * cards. Generic over item type T. Used e.g. to pick a broadcast test recipient
 * from all users (Nova-Poshta-style search).
 */
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Search, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props<T> {
  label: string;
  selectedLabel?: string | null;
  fetchItems: (q: string) => Promise<T[]>;
  itemLabel: (item: T) => string;
  itemSubLabel?: (item: T) => string | undefined;
  itemKey: (item: T) => string;
  onSelect: (item: T) => void;
  onClear?: () => void;
  placeholderHint?: string;
  minChars?: number;
}

export function GlassAutocomplete<T>({
  label,
  selectedLabel,
  fetchItems,
  itemLabel,
  itemSubLabel,
  itemKey,
  onSelect,
  onClear,
  placeholderHint = "Введите имя, @username или ID",
  minChars = 1,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const reposition = () => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 8, left: r.left, width: r.width });
  };
  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  // Debounced fetch.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < minChars) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const id = ++reqId.current;
    const t = setTimeout(() => {
      fetchItems(q)
        .then((res) => id === reqId.current && setItems(res))
        .catch(() => id === reqId.current && setError(true))
        .finally(() => id === reqId.current && setLoading(false));
    }, 280);
    return () => clearTimeout(t);
  }, [query, open, fetchItems, minChars]);

  // Close on outside click / scroll / resize.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => reposition();
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
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="glass flex w-full items-center gap-2 rounded-[var(--r-md)] px-4 py-3 text-left outline-none"
      >
        <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-[var(--text-muted)]">{label}</span>
          <span
            className={`block truncate text-[15px] ${
              selectedLabel ? "text-[var(--text)]" : "text-[var(--text-faint)]"
            }`}
          >
            {selectedLabel || "Не выбрано"}
          </span>
        </span>
        {selectedLabel && onClear && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Очистить"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="grid h-7 w-7 place-items-center rounded-full text-[var(--text-muted)] hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </span>
        )}
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && rect && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.16 }}
                style={{ top: rect.top, left: rect.left, width: rect.width }}
                className="glass glass--floating glass--strong fixed z-[200] max-h-[60vh] overflow-hidden rounded-[var(--r-md)]"
              >
                <div className="border-b border-white/10 p-2">
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Поиск…"
                    className="w-full bg-transparent px-2 py-2 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
                  />
                </div>
                <div className="thin-scroll max-h-[46vh] overflow-y-auto">
                  {loading && (
                    <div className="flex items-center justify-center gap-2 py-6 text-[13px] text-[var(--text-muted)]">
                      <Loader2 className="h-4 w-4 animate-spin" /> Поиск…
                    </div>
                  )}
                  {!loading && error && (
                    <p className="px-4 py-6 text-center text-[13px] text-[var(--danger)]">
                      Не удалось загрузить
                    </p>
                  )}
                  {!loading && !error && query.trim().length < minChars && (
                    <p className="px-4 py-6 text-center text-[13px] text-[var(--text-faint)]">
                      {placeholderHint}
                    </p>
                  )}
                  {!loading && !error && query.trim().length >= minChars && items.length === 0 && (
                    <p className="px-4 py-6 text-center text-[13px] text-[var(--text-faint)]">
                      Ничего не найдено
                    </p>
                  )}
                  {!loading &&
                    !error &&
                    items.map((item) => (
                      <button
                        key={itemKey(item)}
                        type="button"
                        onClick={() => {
                          onSelect(item);
                          setOpen(false);
                          setQuery("");
                        }}
                        className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-white/10"
                      >
                        <span className="text-[14px] font-medium text-[var(--text)]">
                          {itemLabel(item)}
                        </span>
                        {itemSubLabel?.(item) && (
                          <span className="text-[12px] text-[var(--text-muted)]">
                            {itemSubLabel(item)}
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
