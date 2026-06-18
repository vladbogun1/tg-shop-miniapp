"use client";

/**
 * GlassAutocomplete — custom glass combobox (NO native select, design doc §8.4).
 * Debounced async search, glass dropdown menu, keyboard-friendly, loading state.
 * Generic over item type T.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props<T> {
  label: string;
  /** Currently selected display value (controlled). */
  selectedLabel?: string | null;
  /** Async fetcher for the query. */
  fetchItems: (q: string) => Promise<T[]>;
  /** Render an item's primary text. */
  itemLabel: (item: T) => string;
  /** Render an item's secondary text. */
  itemSubLabel?: (item: T) => string | undefined;
  itemKey: (item: T) => string;
  onSelect: (item: T) => void;
  onClear?: () => void;
  disabled?: boolean;
  placeholderHint?: string;
  minChars?: number;
  status?: "ok" | "danger";
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
  disabled,
  placeholderHint = "Введите минимум 2 символа",
  minChars = 2,
  status,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

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
        .then((res) => {
          if (id === reqId.current) setItems(res);
        })
        .catch(() => {
          if (id === reqId.current) setError(true);
        })
        .finally(() => {
          if (id === reqId.current) setLoading(false);
        });
    }, 280);
    return () => clearTimeout(t);
  }, [query, open, fetchItems, minChars]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const ring =
    status === "danger"
      ? "[box-shadow:inset_0_0_0_1.5px_var(--danger)]"
      : open
        ? "[box-shadow:inset_0_0_0_1.5px_var(--accent)]"
        : "[box-shadow:inset_0_1px_0_var(--glass-stroke),inset_0_-1px_0_var(--glass-stroke-bottom)]";

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`glass tap flex w-full items-center gap-2 rounded-[var(--r-md)] px-4 py-3 text-left transition-shadow disabled:opacity-50 ${ring}`}
      >
        <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-[var(--text-muted)]">
            {label}
          </span>
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
            className="tap flex h-7 w-7 min-h-0 min-w-0 items-center justify-center rounded-full text-[var(--text-muted)]"
          >
            <X className="h-4 w-4" />
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="glass glass--floating glass--strong absolute z-50 mt-2 max-h-[44dvh] w-full overflow-hidden rounded-[var(--r-md)]"
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
            <div className="max-h-[34dvh] overflow-y-auto overscroll-contain">
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
              {!loading &&
                !error &&
                query.trim().length >= minChars &&
                items.length === 0 && (
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
                    className="tap flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors hover:bg-white/5"
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
      </AnimatePresence>
    </div>
  );
}
