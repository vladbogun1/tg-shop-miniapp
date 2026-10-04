"use client";

/**
 * Header search with live suggestions (ARIA combobox). Typing ≥ 2 characters asks the public
 * catalog for the first few matches; Enter (or "all results") goes to /search?q=…. Arrow keys move
 * through the suggestions, Escape closes them.
 */
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";

export function SearchBox() {
  const { t, href, locale } = useI18n();
  const fmt = useFmt();
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const term = useDebounced(q.trim(), 250);

  const { data, isFetching } = useQuery({
    // Locale in the key: titles come back translated (Accept-Language).
    queryKey: ["suggest", term, locale],
    enabled: term.length >= 2,
    staleTime: 60_000,
    queryFn: () => api.products({ q: term, size: 6 }),
  });
  const items = term.length >= 2 ? data?.items ?? [] : [];
  const showList = open && term.length >= 2;
  const total = items.length + 1; // + "all results"

  useEffect(() => setActive(-1), [term]);

  // Close when focus/clicks leave the box.
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function goSearch() {
    const value = q.trim();
    if (!value) return;
    setOpen(false);
    inputRef.current?.blur();
    router.push(href(`/search?q=${encodeURIComponent(value)}`));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % total);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? total - 1 : a - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showList && active >= 0 && active < items.length) {
        setOpen(false);
        router.push(href(`/product/${items[active].slug}`));
      } else {
        goSearch();
      }
    }
  }

  const listId = `${id}-list`;

  return (
    <div ref={wrapRef} className="relative w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          goSearch();
        }}
        className="flex h-11 items-center overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]"
      >
        <Search className="ml-3 h-4 w-4 shrink-0 text-[var(--muted)]" strokeWidth={2.25} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t("header.search")}
          aria-label={t("header.search")}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[15px] font-normal text-[var(--ink)] outline-none placeholder:text-[var(--faint)] [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            aria-label={t("common.close")}
            className="grid h-8 w-8 shrink-0 place-items-center text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        )}
        <button
          type="submit"
          className="h-full shrink-0 border-l border-[var(--line)] bg-[var(--surface-2)] px-4 font-display text-[12px] font-semibold uppercase tracking-[.1em] text-[var(--muted)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
        >
          {t("header.searchSubmit")}
        </button>
      </form>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("header.search")}
          className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-[70vh] overflow-y-auto rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface)] py-1 shadow-[0_24px_48px_-16px_rgba(0,0,0,.85)]"
        >
          {isFetching && items.length === 0 && (
            <li className="flex items-center gap-2 px-4 py-3 text-[13px] font-medium text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("header.searchSearching")}
            </li>
          )}
          {!isFetching && items.length === 0 && (
            <li className="px-4 py-3 text-[13px] font-medium text-[var(--muted)]">{t("header.searchEmpty")}</li>
          )}
          {items.map((p, i) => (
            <li
              key={p.id}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={active === i}
              className={active === i ? "bg-[var(--surface-2)]" : ""}
            >
              <Link
                href={href(`/product/${p.slug}`)}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--surface-2)]"
                tabIndex={-1}
              >
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]">
                  <Image src={p.images?.[0]?.url} alt="" size={120} className="h-full w-full" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--ink)]">{p.title}</span>
                <span className="shrink-0 font-display text-[14px] font-bold tabular-nums text-[var(--ink)]">{fmt.money(p.priceMinor, p.currency)}</span>
              </Link>
            </li>
          ))}
          <li
            id={`${id}-opt-${items.length}`}
            role="option"
            aria-selected={active === items.length}
            className={`border-t border-[var(--line)] ${active === items.length ? "bg-[var(--surface-2)]" : ""}`}
          >
            <button
              type="button"
              tabIndex={-1}
              onClick={goSearch}
              className="w-full px-4 py-3 text-left font-display text-[13px] font-semibold uppercase tracking-[.08em] text-[var(--accent-hi)] hover:bg-[var(--surface-2)]"
            >
              {t("header.searchAll", { q: q.trim() })}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
