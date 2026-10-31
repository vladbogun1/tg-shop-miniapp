"use client";

import { motion } from "framer-motion";
import { ChevronDown, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, useTransition } from "react";
import { buildFacets, type CatalogFilter, type Facet, filterProducts, filterToParams, parseRange, priceBounds } from "@shop/core/catalog";
import { type CatalogSort } from "@shop/core/site";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n";
import type { CatalogEngine } from "@/features/catalog";
import { type CatalogState, catalogHref, SORTS } from "@/features/catalog";

export const RESULTS_ID = "catalog-results";

export function headerHeight(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 72;
}

/**
 * Back to the top of the list after a new selection or page — only when that point is above the
 * screen (a visitor who is already looking at it keeps their place) — and focus «Знайдено N», so
 * keyboard and screen-reader users land on the result too.
 */
export function toResults() {
  const mark = document.getElementById(RESULTS_ID);
  if (!mark) return;
  const top = mark.getBoundingClientRect().top;
  const hh = headerHeight();
  if (top < hh) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: window.scrollY + top - hh - 12, behavior: reduce ? "instant" : "smooth" });
  }
  const found = [...document.querySelectorAll<HTMLElement>("[data-found]")].find((el) => el.offsetParent !== null);
  found?.focus({ preventScroll: true });
}

export function useMedia(query: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = () => setOn(mq.matches);
    h();
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [query]);
  return on;
}

// ---------------------------------------------------------------- draft + navigation

export interface DraftView {
  facets: Facet[];
  price: { min: number; max: number } | null;
  /** Products the draft selection matches — the N of «Показати N». */
  total: number;
}

export interface Nav {
  pending: boolean;
  /** Locale-prefixed URL of a state. */
  url: (s: CatalogState) => string;
  /** Navigate now (chips, reset, sort, pages); `toResults` also brings the list into view. */
  go: (s: CatalogState, opts?: { toResults?: boolean }) => void;
  /** The state of the URL. */
  applied: CatalogState;
  draft: CatalogFilter;
  /** The draft differs from the URL. */
  dirty: boolean;
  /** Facets, price bounds and N for the draft; null when the listing failed to load. */
  view: DraftView | null;
  /** Value tokens of the applied selection (see `tokens`), to mark what the draft changed. */
  appliedTokens: Set<string>;
  /** Facets open by default, decided on the APPLIED selection so a section never folds under the cursor. */
  openKeys: Set<string>;
  /** Edits the draft; `anchor` = the row that changed (the desktop callout points at it). */
  setDraft: (f: CatalogFilter, anchor?: Element | null) => void;
  anchor: Element | null;
  apply: () => void;
  cancel: () => void;
}

export const NavContext = createContext<Nav | null>(null);

/** Canonical text of a filter for comparing selections (category and search text left out). */
export const filterKey = (f: CatalogFilter) => filterToParams({ ...f, category: undefined, q: undefined }).toString();

/** "brand:razer", "cond:USED", "sensor:paw3950", "dpi=100..", "price=..900", "stock". */
export function tokens(f: CatalogFilter): Set<string> {
  const out = new Set<string>();
  if (f.inStock) out.add("stock");
  if (f.priceMin != null || f.priceMax != null) out.add(`price=${f.priceMin ?? ""}..${f.priceMax ?? ""}`);
  for (const b of f.brands ?? []) out.add(`brand:${b}`);
  for (const c of f.conditions ?? []) out.add(`cond:${c}`);
  for (const [k, vals] of Object.entries(f.attrs ?? {})) {
    if (vals.length === 1 && vals[0].includes("..")) out.add(`${k}=${vals[0]}`);
    else for (const v of vals) out.add(`${k}:${v}`);
  }
  return out;
}

export const rangeToken = (key: string, f: CatalogFilter) => {
  const v = f.attrs?.[key];
  return v?.length === 1 && v[0].includes("..") ? v[0] : "";
};

/**
 * The draft's facets laid over the APPLIED ones, so the panel holds still while drafting: sections
 * and values keep the applied order (selected-first is re-sorted only after «Показати»), and a
 * section or value the draft leaves with no products stays in place with 0 (greyed out) instead of
 * vanishing under the cursor.
 */
export function overApplied(draft: Facet[], base: Facet[], f: CatalogFilter): Facet[] {
  const sel = tokens(f);
  const byKey = new Map(draft.map((x) => [x.key, x]));
  const out = base.map((b): Facet => {
    const d = byKey.get(b.key);
    if (!d) {
      return {
        ...b,
        values: b.values.map((v) => ({ ...v, count: 0, selected: sel.has(`${b.key}:${v.value}`) })),
        selectedRange: parseRange(rangeToken(b.key, f)) ?? undefined,
      };
    }
    if (d.kind === "range") return d;
    const dv = new Map(d.values.map((v) => [v.value, v]));
    const values = b.values.map((v) => dv.get(v.value) ?? { ...v, count: 0, selected: false });
    for (const v of d.values) if (!b.values.some((x) => x.value === v.value)) values.push(v);
    return { ...d, values };
  });
  for (const d of draft) if (!base.some((b) => b.key === d.key)) out.push(d);
  return out;
}

export const OPEN_SECTIONS = 6;

/**
 * Wraps the catalog screen: the applied state (from the URL), the draft and its recount, and one
 * transition for every navigation (the grid dims while the server renders).
 */
export function CatalogNavProvider({
  state,
  engine,
  children,
}: {
  state: CatalogState;
  engine: CatalogEngine | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { href } = useI18n();
  const [pending, start] = useTransition();
  const url = useCallback((s: CatalogState) => href(catalogHref(s)), [href]);
  const go = useCallback(
    (s: CatalogState, opts?: { toResults?: boolean }) => {
      start(() => router.replace(url(s), { scroll: false }));
      if (opts?.toResults) requestAnimationFrame(toResults);
    },
    [router, url]
  );

  // The draft follows the URL: a new applied state (any navigation) starts a clean draft.
  const appliedKey = url(state);
  const [d, setD] = useState<{ key: string; filter: CatalogFilter; anchor: Element | null }>({ key: appliedKey, filter: state.filter, anchor: null });
  let draft = d;
  if (d.key !== appliedKey) {
    draft = { key: appliedKey, filter: state.filter, anchor: null };
    setD(draft);
  }

  const applied = useMemo(() => {
    if (!engine) return null;
    const facets = buildFacets(engine.schema, engine.products, { ...state.filter, q: undefined, category: engine.category }, engine.labels);
    const price = priceBounds(engine.schema, engine.products, { ...state.filter, q: undefined, category: engine.category });
    const open = new Set(
      facets
        .filter((f, i) => i < OPEN_SECTIONS || (f.kind === "range" ? !!f.selectedRange : f.values.some((v) => v.selected)))
        .map((f) => f.key)
    );
    return { facets, price, open };
  }, [engine, state.filter]);

  const view = useMemo<DraftView | null>(() => {
    if (!engine || !applied) return null;
    const f: CatalogFilter = { ...draft.filter, q: undefined, category: engine.category };
    return {
      facets: overApplied(buildFacets(engine.schema, engine.products, f, engine.labels), applied.facets, draft.filter),
      price: priceBounds(engine.schema, engine.products, f) ?? applied.price,
      total: filterProducts(engine.schema, engine.products, f).length,
    };
  }, [engine, applied, draft.filter]);

  const dirty = filterKey(draft.filter) !== filterKey(state.filter);
  const setDraft = useCallback((filter: CatalogFilter, anchor?: Element | null) => setD((x) => ({ ...x, filter, anchor: anchor ?? x.anchor })), []);
  const cancel = useCallback(() => setD((x) => ({ ...x, filter: state.filter, anchor: null })), [state.filter]);
  const apply = useCallback(() => {
    if (dirty) go({ ...state, filter: draft.filter, page: 1 }, { toResults: true });
  }, [dirty, go, state, draft.filter]);

  const appliedTokens = useMemo(() => tokens(state.filter), [state.filter]);
  const value: Nav = {
    pending,
    url,
    go,
    applied: state,
    draft: draft.filter,
    dirty,
    view,
    appliedTokens,
    openKeys: applied?.open ?? new Set(),
    setDraft,
    anchor: draft.anchor,
    apply,
    cancel,
  };
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error("useNav outside CatalogNavProvider");
  return nav;
}

/** The results column: dimmed while a new selection is rendering. */
export function PendingRegion({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useNav();
  return (
    <div aria-busy={pending} className={`transition-opacity duration-200 ${pending ? "pointer-events-none opacity-50" : ""} ${className}`}>
      {children}
    </div>
  );
}

export const plainClick = (e: React.MouseEvent) => !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

/**
 * A real link to a state; plain click → client navigation without scrolling. `toResults`
 * (pagination) brings the top of the list into view instead, and the link is followable.
 */
export function StateLink({
  state,
  toResults,
  className,
  children,
  ...rest
}: { state: CatalogState; toResults?: boolean; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const { url, go } = useNav();
  return (
    <a
      href={url(state)}
      rel={toResults ? undefined : "nofollow"}
      className={className}
      onClick={(e) => {
        if (!plainClick(e)) return;
        e.preventDefault();
        go(state, { toResults });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export const withFilter = (s: CatalogState, filter: CatalogFilter): CatalogState => ({ ...s, filter, page: 1 });

// ---------------------------------------------------------------- «Показати ще»

/**
 * Appends the next page under the shown ones instead of switching pages: the URL becomes
 * `?page=N+1&from=<first shown>`, so a reload or «back» lands on the same list (and the variant is
 * noindex + canonical to the plain page, see catalogPageMeta). Its own transition: the shown cards
 * stay as they are (no dimming like a new selection), only the button spins; the new cards come in
 * below, the scroll position stays.
 */
export function ShowMore({ state, from, page, pages, total, pageSize }: { state: CatalogState; from: number; page: number; pages: number; total: number; pageSize: number }) {
  const { t } = useI18n();
  const { url } = useNav();
  const router = useRouter();
  const [loading, start] = useTransition();
  if (page >= pages) return null;
  const next: CatalogState = { ...state, page: page + 1, from };
  const shown = Math.min(page * pageSize, total) - (from - 1) * pageSize;
  const more = Math.min(pageSize, total - page * pageSize);
  return (
    <div className="mt-8 flex flex-col items-center gap-2.5">
      <a
        href={url(next)}
        rel="nofollow"
        aria-busy={loading}
        onClick={(e) => {
          if (!plainClick(e)) return;
          e.preventDefault();
          if (loading) return;
          start(() => router.replace(url(next), { scroll: false }));
        }}
        className={`tap inline-flex min-h-[52px] w-full max-w-[420px] items-center justify-center gap-2.5 rounded-[var(--r)] border border-[rgba(255,102,0,.55)] bg-[var(--accent-soft)] px-6 font-display text-[14px] font-bold uppercase tracking-[.08em] text-[var(--accent-hi)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] ${loading ? "pointer-events-none" : ""}`}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <ChevronDown className="h-4 w-4" strokeWidth={2.5} />}
        {t("catalog.showMore", { n: more })}
      </a>
      <p className="text-[12.5px] font-medium text-[var(--muted)]">{t("catalog.shownOf", { n: shown, total })}</p>
    </div>
  );
}

// ---------------------------------------------------------------- sort

export function CatalogSortSelect({ state }: { state: CatalogState }) {
  const { t } = useI18n();
  const id = useId();
  const { go, pending } = useNav();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
      <label htmlFor={id} className="eyebrow hidden text-[11px] xl:block">
        {t("catalog.sort")}
      </label>
      <select
        id={id}
        value={state.sort}
        aria-busy={pending}
        onChange={(e) => go({ ...state, sort: e.target.value as CatalogSort, page: 1 })}
        className="nb-select h-11 w-full min-w-0 rounded-[var(--r)] border border-[var(--line-strong)] pl-3 text-[14px] font-medium text-[var(--ink)] focus:border-[var(--accent)] sm:w-[220px]"
      >
        {SORTS.map((s) => (
          <option key={s} value={s}>
            {t(`catalog.sort.${s}` as MessageKey)}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------- «Знайдено N»

/** «Знайдено N» of the applied selection; the focus target after a new selection (tabIndex −1). */
export function FoundCount({ total, className = "" }: { total: number; className?: string }) {
  const { t } = useI18n();
  return (
    <p data-found tabIndex={-1} aria-live="polite" className={`flex items-center gap-2 text-[14px] font-medium text-[var(--muted)] outline-none ${className}`}>
      <span aria-hidden className="tech-mark" />
      {t("catalog.found", { n: total })}
    </p>
  );
}

// ---------------------------------------------------------------- facet panel

