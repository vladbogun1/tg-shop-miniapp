"use client";

/**
 * The autocomplete field behind the Nova Poshta city and branch inputs: an input with an icon,
 * a spinner, and a listbox under it (arrows / Enter / Escape on desktop, taps on phones).
 *
 * On a phone the field scrolls itself to the top third of the screen when it gets focus, so the
 * keyboard that slides up next does not cover it or its suggestions.
 */
import { Loader2 } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

export interface NpComboboxProps<T> {
  label: string;
  placeholder: string;
  icon: ReactNode;
  value: string;
  onText: (v: string) => void;
  items: T[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onPick: (item: T) => void;
  /** Show the list at all (e.g. the query is long enough). */
  listOpen: boolean;
  loading?: boolean;
  emptyText: string;
  inputMode?: "text" | "search";
}

export function NpCombobox<T>({
  label,
  placeholder,
  icon,
  value,
  onText,
  items,
  itemKey,
  renderItem,
  onPick,
  listOpen,
  loading = false,
  emptyText,
  inputMode = "search",
}: NpComboboxProps<T>) {
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const show = open && listOpen;

  function pick(item: T) {
    setOpen(false);
    setActive(-1);
    onPick(item);
  }

  function keepInView() {
    // Only on touch screens: wait for the keyboard to start sliding up, then park the field high.
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    window.setTimeout(() => {
      wrap.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  }

  return (
    <div ref={wrap} className="relative scroll-mt-20">
      <label htmlFor={id} className="eyebrow mb-1.5 block text-[11px]">
        {label}
      </label>
      <div className="flex h-12 items-center gap-2 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
        <span className="shrink-0 text-[var(--muted)]">{icon}</span>
        <input
          id={id}
          value={value}
          onChange={(e) => {
            onText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={(e) => {
            setOpen(true);
            e.currentTarget.select();
            keepInView();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const it = show ? items[active >= 0 ? active : 0] : undefined;
              if (it) pick(it);
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={show}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          inputMode={inputMode}
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
        />
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--muted)]" />}
      </div>
      {show && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute inset-x-0 top-full z-[1100] mt-1.5 max-h-[min(18rem,40dvh)] overflow-y-auto overscroll-contain rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface)] py-1 shadow-[0_24px_48px_-16px_rgba(0,0,0,.85)]"
        >
          {items.length === 0 && !loading && (
            <li className="px-3 py-2.5 text-[13px] font-medium text-[var(--muted)]">{emptyText}</li>
          )}
          {items.map((it, i) => (
            <li key={itemKey(it)} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(it)}
                className={`flex w-full flex-col items-start px-3 py-2 text-left hover:bg-[var(--surface-2)] ${
                  i === active ? "bg-[var(--surface-2)]" : ""
                }`}
              >
                {renderItem(it)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
