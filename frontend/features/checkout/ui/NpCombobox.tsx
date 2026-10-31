"use client";

/**
 * NpCombobox — the autocomplete field behind the Nova Poshta city and branch inputs of the
 * checkout (same behaviour as the website's site/components/checkout/NpCombobox.tsx, dressed in
 * the Mini App's ChiSetup field: graphite surface, hairline, orange focus ring, floating label).
 *
 * Phones (Telegram): the on-screen keyboard does not shrink the layout viewport on iOS, so a list
 * that simply hangs under the field ends up behind the keyboard. On focus the field scrolls itself
 * to the top of the screen, and the list's height is cut to what is left of the VISUAL viewport
 * between the field and the keyboard. The tab bar hides itself while the keyboard is up
 * (`--tabbar-h` → 0) and the checkout action bar fades out, so nothing else docks over the list.
 */
import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

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
  /** Accessible name of the "clear" cross. */
  clearLabel: string;
  /** Something is picked — the field gets the "ok" border. */
  picked?: boolean;
  /** Extra controls between the field and the list (the branch-type chips). */
  header?: ReactNode;
  inputMode?: "text" | "search" | "numeric";
}

/** Lowest list height worth showing; below it the page scrolls instead. */
const MIN_LIST = 120;
const MAX_LIST = 288;

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
  clearLabel,
  picked = false,
  header,
  inputMode = "search",
}: NpComboboxProps<T>) {
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /** The field was already scrolled up for this opening of the list. */
  const lifted = useRef(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [maxH, setMaxH] = useState(MAX_LIST);
  const show = open && listOpen;

  /** Fit the list between the field and the bottom of the visible screen (keyboard included). */
  const fit = useCallback(() => {
    const el = field.current;
    if (!el) return;
    const vv = window.visualViewport;
    // Bottom of what is actually visible, in layout-viewport coordinates (above the keyboard).
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    // Measure from the list itself: the type chips above it take room too.
    const top = list.current?.getBoundingClientRect().top ?? el.getBoundingClientRect().bottom + 6;
    const room = bottom - top - 12;
    if (room < MIN_LIST && !lifted.current) {
      // The field sits too low for a usable list: bring it up once, then measure again.
      lifted.current = true;
      wrap.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setMaxH(Math.max(MIN_LIST, Math.min(MAX_LIST, Math.floor(room))));
  }, []);

  useEffect(() => {
    if (!show) {
      lifted.current = false;
      return;
    }
    fit();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    window.addEventListener("scroll", fit, { passive: true });
    return () => {
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      window.removeEventListener("scroll", fit);
    };
  }, [show, fit]);

  function pick(item: T) {
    setOpen(false);
    setActive(-1);
    onPick(item);
    input.current?.blur();
  }

  function keepInView() {
    // Touch screens only: wait for the keyboard to start sliding up, then park the field high.
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    window.setTimeout(() => {
      wrap.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(fit, 350);
    }, 300);
  }

  const floated = focused || value.length > 0;

  return (
    <div ref={wrap} className="relative" style={{ scrollMarginTop: "calc(var(--safe-top) + 12px)" }}>
      <div
        ref={field}
        className="relative flex h-14 items-center gap-2.5 rounded-[var(--r)] border bg-[var(--surface-2)] pl-3.5 pr-2 transition-[border-color,box-shadow]"
        style={{
          borderColor: focused ? "var(--accent)" : picked ? "var(--ok)" : "var(--line)",
          boxShadow: focused ? "0 0 0 3px var(--accent-soft)" : undefined,
        }}
      >
        <span className="shrink-0" style={{ color: focused || picked ? "var(--accent)" : "var(--muted)" }}>
          {icon}
        </span>
        <div className="relative h-full min-w-0 flex-1">
          <label
            htmlFor={id}
            className={`pointer-events-none absolute left-0 origin-left truncate transition-all duration-150 ${
              floated
                ? "font-display top-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"
                : "top-1/2 -translate-y-1/2 text-[15px] text-[var(--faint)]"
            }`}
            style={{ maxWidth: "100%" }}
          >
            {label}
          </label>
          <input
            ref={input}
            id={id}
            value={value}
            onChange={(e) => {
              onText(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={(e) => {
              setFocused(true);
              setOpen(true);
              e.currentTarget.select();
              keepInView();
            }}
            onBlur={() => {
              setFocused(false);
              window.setTimeout(() => setOpen(false), 150);
            }}
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
            placeholder={focused ? placeholder : ""}
            role="combobox"
            aria-expanded={show}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode={inputMode}
            enterKeyHint="search"
            className="absolute inset-x-0 bottom-0 h-full w-full bg-transparent pb-2 pt-6 text-[15px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
          />
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--muted)]" />
        ) : value && focused ? (
          <button
            type="button"
            aria-label={clearLabel}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onText("");
              setOpen(true);
              input.current?.focus();
            }}
            className="tap grid h-8 w-8 min-h-0 min-w-0 shrink-0 place-items-center rounded-full text-[var(--muted)]"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        ) : null}
      </div>
      {show && (
        <div
          className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[0_24px_48px_-16px_rgba(0,0,0,.85)]"
          // Taps on the chips must not blur the input (that would close the list).
          onMouseDown={(e) => e.preventDefault()}
        >
          {header}
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            className="overflow-y-auto overscroll-contain py-1"
            style={{ maxHeight: maxH }}
          >
            {items.length === 0 && !loading && (
              <li className="px-3.5 py-3 text-[13px] font-medium text-[var(--muted)]">{emptyText}</li>
            )}
            {items.map((it, i) => (
              <li key={itemKey(it)} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onClick={() => pick(it)}
                  className={`tap flex min-h-[44px] w-full flex-col items-start justify-center px-3.5 py-2 text-left transition-colors active:bg-[var(--surface-2)] ${
                    i === active ? "bg-[var(--surface-2)]" : ""
                  }`}
                >
                  {renderItem(it)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
