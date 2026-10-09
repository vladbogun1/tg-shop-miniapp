"use client";

/**
 * Catalog v2 filters (docs/CATALOG-SPECS.md §5 «Сайт»): the facet panel (right column from 1280 px,
 * a drawer/sheet below), the sort dropdown and the navigation that ties them to the URL.
 *
 * The APPLIED selection lives in the query string in the shared format (`filterToParams`), so a
 * filtered page is server-rendered, shareable and works without JS: every option is a real link
 * (rel=nofollow — filter combinations are noindex anyway).
 *
 * With JS a click on an option only edits a DRAFT: the tick flips at once, «Показати N» and every
 * facet count are recounted in the browser by the same shared engine over the listing's product
 * pool (`CatalogEngine`, ~220 products — cheaper and more exact than a server call per click), and
 * the URL stays put until the visitor applies. Then it is one `router.replace` without a scroll jump
 * (the grid dims while the server renders) plus a scroll back to the top of the list when it is
 * above the screen. Chip removal, «Скинути все», sort and pagination navigate at once.
 */
import { AnimatePresence, motion, type PanInfo, useDragControls, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Loader2, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  activeFilterCount,
  buildFacets,
  type CatalogFilter,
  type CatalogSort,
  type Facet,
  filterProducts,
  filterToParams,
  noFadeFlash,
  parseRange,
  priceBounds,
  toggleFacet,
} from "@shop/shared";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n";
import type { CatalogEngine } from "@/lib/catalog";
import { type CatalogState, catalogHref, hasFilters, SORTS } from "@/lib/catalog-params";
import { useDebounced, useEscape, useHydrated, useScrollLock } from "@/lib/hooks";

// ---------------------------------------------------------------- scroll helpers

/** Id of the zero-height mark right above «Фільтри · Знайдено N · sort» (see CatalogView). */
export const RESULTS_ID = "catalog-results";

function headerHeight(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 72;
}

/**
 * Back to the top of the list after a new selection or page — only when that point is above the
 * screen (a visitor who is already looking at it keeps their place) — and focus «Знайдено N», so
 * keyboard and screen-reader users land on the result too.
 */
function toResults() {
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

function useMedia(query: string): boolean {
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

interface DraftView {
  facets: Facet[];
  price: { min: number; max: number } | null;
  /** Products the draft selection matches — the N of «Показати N». */
  total: number;
}

interface Nav {
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

const NavContext = createContext<Nav | null>(null);

/** Canonical text of a filter for comparing selections (category and search text left out). */
const filterKey = (f: CatalogFilter) => filterToParams({ ...f, category: undefined, q: undefined }).toString();

/** "brand:razer", "cond:USED", "sensor:paw3950", "dpi=100..", "price=..900", "stock". */
function tokens(f: CatalogFilter): Set<string> {
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

const rangeToken = (key: string, f: CatalogFilter) => {
  const v = f.attrs?.[key];
  return v?.length === 1 && v[0].includes("..") ? v[0] : "";
};

/**
 * The draft's facets laid over the APPLIED ones, so the panel holds still while drafting: sections
 * and values keep the applied order (selected-first is re-sorted only after «Показати»), and a
 * section or value the draft leaves with no products stays in place with 0 (greyed out) instead of
 * vanishing under the cursor.
 */
function overApplied(draft: Facet[], base: Facet[], f: CatalogFilter): Facet[] {
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

const OPEN_SECTIONS = 6;

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

function useNav(): Nav {
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

const plainClick = (e: React.MouseEvent) => !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

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

const withFilter = (s: CatalogState, filter: CatalogFilter): CatalogState => ({ ...s, filter, page: 1 });

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

const SHOW_FIRST = 6;
const COLLAPSE_AFTER = 8;

/** The panel body over the DRAFT selection (desktop column and the drawer render the same one). */
export function FacetPanel({ hint }: { /** /catalog and search: no category → no characteristic facets, say why. */ hint?: boolean }) {
  const { t } = useI18n();
  const { view, draft: f, applied, appliedTokens, openKeys } = useNav();
  if (!view) return null;
  const price = view.price;
  const priceSet = f.priceMin != null || f.priceMax != null;
  const priceChanged = f.priceMin !== applied.filter.priceMin || f.priceMax !== applied.filter.priceMax;
  return (
    <div className="flex flex-col">
      <Section title={t("catalog.availability")} open>
        <OptionRow next={{ ...f, inStock: !f.inStock }} selected={!!f.inStock} changed={!!f.inStock !== appliedTokens.has("stock")} label={t("catalog.inStock")} />
      </Section>
      {price && (price.max > price.min || priceSet) && (
        <Section title={t("catalog.price")} open selected={priceSet}>
          <RangeForm
            min={price.min}
            max={price.max}
            from={f.priceMin ?? null}
            to={f.priceMax ?? null}
            changed={priceChanged}
            onChange={(a, b) => ({ ...f, priceMin: a, priceMax: b })}
          />
        </Section>
      )}
      {view.facets.map((facet) => {
        const selected = facet.kind === "range" ? !!facet.selectedRange : facet.values.some((v) => v.selected);
        return (
          <Section
            key={facet.key}
            title={facet.unit && facet.kind !== "options" ? `${facet.label}, ${facet.unit}` : facet.label}
            open={openKeys.has(facet.key)}
            selected={selected}
          >
            {facet.kind === "range" ? (
              <RangeForm
                min={facet.min ?? 0}
                max={facet.max ?? 0}
                from={facet.selectedRange?.min ?? null}
                to={facet.selectedRange?.max ?? null}
                changed={rangeToken(facet.key, f) !== rangeToken(facet.key, applied.filter)}
                onChange={(a, b) => {
                  const attrs = { ...(f.attrs ?? {}) };
                  if (a == null && b == null) delete attrs[facet.key];
                  else attrs[facet.key] = [`${a ?? ""}..${b ?? ""}`];
                  return { ...f, attrs };
                }}
              />
            ) : (
              <OptionList facet={facet} />
            )}
          </Section>
        );
      })}
      {hint && <p className="mt-4 text-[13px] font-medium leading-snug text-[var(--muted)]">{t("catalog.hintCategory")}</p>}
    </div>
  );
}

function Section({ title, open, selected, children }: { title: string; open?: boolean; selected?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group/sec border-b border-[var(--line)] py-3 last:border-b-0 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 rounded-[var(--r)] text-[13px] font-semibold text-[var(--ink)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate">{title}</span>
          {selected && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] shadow-[0_0_6px_rgba(255,102,0,.8)]" />}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted)] transition-transform group-open/sec:rotate-180" strokeWidth={2.25} />
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}

function OptionList({ facet }: { facet: Facet }) {
  const { t } = useI18n();
  const { draft, appliedTokens } = useNav();
  const [all, setAll] = useState(false);
  const long = facet.values.length > COLLAPSE_AFTER;
  const shown = !long || all ? facet.values : facet.values.filter((v, i) => i < SHOW_FIRST || v.selected);
  return (
    <ul className="flex flex-col gap-0.5">
      {shown.map((v) => {
        const next =
          facet.kind === "bool"
            ? { ...draft, attrs: { ...(draft.attrs ?? {}), [facet.key]: v.selected ? [] : ["1"] } }
            : toggleFacet(draft, facet.key, v.value);
        return (
          <li key={v.value}>
            <OptionRow
              next={next}
              selected={v.selected}
              changed={v.selected !== appliedTokens.has(`${facet.key}:${facet.kind === "bool" ? "1" : v.value}`)}
              label={facet.kind === "bool" ? t("catalog.yes") : v.label}
              count={v.count}
            />
          </li>
        );
      })}
      {long && (
        <li>
          <button
            type="button"
            onClick={() => setAll((x) => !x)}
            className="mt-1 min-h-9 px-1 text-[13px] font-semibold text-[var(--accent-hi)] transition-colors hover:text-[var(--ink)]"
          >
            {all ? t("catalog.lessValues") : t("catalog.moreValues", { n: facet.values.length })}
          </button>
        </li>
      )}
    </ul>
  );
}

/** Changed in the draft, not applied yet: a soft orange row with an accent edge. */
const CHANGED = "bg-[rgba(255,102,0,.08)] shadow-[inset_2px_0_0_var(--accent)]";

/**
 * One option: a link to the applied state with this value toggled (no JS / new tab), a draft toggle
 * on a plain click or Space.
 */
function OptionRow({ next, selected, changed, label, count }: { next: CatalogFilter; selected: boolean; changed: boolean; label: string; count?: number }) {
  const { url, applied, setDraft } = useNav();
  const disabled = !selected && count === 0;
  const toggle = (el: Element) => setDraft(next, el);
  return (
    <a
      href={url(withFilter(applied, next))}
      rel="nofollow"
      role="checkbox"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      data-changed={changed || undefined}
      onClick={(e) => {
        if (!plainClick(e)) return;
        e.preventDefault();
        toggle(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key !== " ") return;
        e.preventDefault();
        toggle(e.currentTarget);
      }}
      className={`group/opt flex min-h-9 items-center gap-2.5 rounded-[var(--r)] px-1.5 text-[14px] font-medium transition-colors ${changed ? CHANGED : "hover:bg-[var(--surface-2)]"} ${
        selected ? "text-[var(--ink)]" : disabled ? "pointer-events-none text-[var(--faint)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
      }`}
    >
      <span
        aria-hidden
        className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors ${
          selected
            ? "border-[var(--accent)] bg-[var(--accent)]"
            : changed
              ? "border-dashed border-[var(--accent)] bg-[var(--surface-2)]"
              : "border-[var(--line-strong)] bg-[var(--surface-2)] group-hover/opt:border-[rgba(255,255,255,.3)]"
        }`}
      >
        {selected && <Check className="h-3 w-3 text-[var(--accent-ink)]" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="shrink-0 font-display text-[12px] tabular-nums text-[var(--faint)]">{count}</span>}
    </a>
  );
}

const num = (s: string) => {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

/** «від – до»: typed bounds go into the draft after a pause, on blur or Enter. */
function RangeForm({
  min,
  max,
  from,
  to,
  changed,
  onChange,
}: {
  min: number;
  max: number;
  from: number | null;
  to: number | null;
  changed: boolean;
  onChange: (from: number | null, to: number | null) => CatalogFilter;
}) {
  const { t } = useI18n();
  const { setDraft } = useNav();
  const ref = useRef<HTMLFormElement>(null);
  const [a, setA] = useState(from != null ? String(from) : "");
  const [b, setB] = useState(to != null ? String(to) : "");
  useEffect(() => setA(from != null ? String(from) : ""), [from]);
  useEffect(() => setB(to != null ? String(to) : ""), [to]);

  const commit = (sa: string, sb: string) => {
    let lo = num(sa);
    let hi = num(sb);
    if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
    // A bound equal to the edge of the data is no filter.
    if (lo != null && lo <= min) lo = null;
    if (hi != null && hi >= max) hi = null;
    if (lo === from && hi === to) return;
    setDraft(onChange(lo, hi), ref.current);
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const da = useDebounced(a, 700);
  const db = useDebounced(b, 700);
  useEffect(() => commitRef.current(da, db), [da, db]);

  const input =
    "h-10 w-full min-w-0 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 font-display text-[14px] font-semibold tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]";
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        commit(a, b);
      }}
      data-changed={changed || undefined}
      className={`flex items-center gap-2 rounded-[var(--r)] p-1 transition-colors ${changed ? CHANGED : ""}`}
    >
      <input
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        value={a}
        onChange={(e) => setA(e.target.value)}
        onBlur={() => commit(a, b)}
        placeholder={`${t("catalog.from")} ${min}`}
        aria-label={t("catalog.from")}
        className={input}
      />
      <span aria-hidden className="text-[var(--faint)]">–</span>
      <input
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        value={b}
        onChange={(e) => setB(e.target.value)}
        onBlur={() => commit(a, b)}
        placeholder={`${t("catalog.to")} ${max}`}
        aria-label={t("catalog.to")}
        className={input}
      />
      {/* Enter submits the form (= commit to the draft); no visible button. */}
      <button type="submit" hidden tabIndex={-1} />
    </form>
  );
}

// ---------------------------------------------------------------- desktop column (≥ 1280 px)

/**
 * Smart sticky: a panel shorter than the screen sticks under the header; a longer one scrolls with
 * the page and sticks by its BOTTOM edge, so every section is reachable without a scroll of its own.
 */
function useSmartStickyTop(ref: React.RefObject<HTMLElement | null>): number | null {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calc = () => {
      if (!el.offsetHeight) return; // hidden below 1280
      setTop(Math.min(headerHeight() + 16, window.innerHeight - el.offsetHeight - 16));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    window.addEventListener("resize", calc);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", calc);
    };
  }, [ref]);
  return top;
}

/** The right column from 1280 px: the panel without its own scroll, plus the draft callout. */
export function FilterSidebar({ hint, resetState }: { hint?: boolean; /** The state without filters, or null when nothing is set. */ resetState: CatalogState | null }) {
  const { t } = useI18n();
  const { applied } = useNav();
  const wrap = useRef<HTMLDivElement>(null);
  const top = useSmartStickyTop(wrap);
  const active = activeFilterCount(applied.filter);
  return (
    <div ref={wrap} className="sticky top-[calc(var(--header-h)+16px)]" style={top != null ? { top } : undefined}>
      <div className="nb px-4 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
          <h2 className="eyebrow flex items-center gap-2 text-[11px]">
            <span aria-hidden className="h-[2px] w-3 bg-[var(--accent)]" />
            {active > 0 ? t("catalog.filtersN", { n: active }) : t("catalog.filters")}
          </h2>
          {resetState && (
            <StateLink state={resetState} className="link-ink text-[12px] font-semibold text-[var(--muted)]">
              {t("catalog.resetAll")}
            </StateLink>
          )}
        </div>
        <FacetPanel hint={hint} />
      </div>
      <DraftCallout wrap={wrap} />
    </div>
  );
}

const applyBtn = "flex h-11 items-center justify-center whitespace-nowrap px-4 font-display text-[13px] font-bold uppercase tracking-[.06em]";
const applyOff = "chamfer cursor-not-allowed bg-[var(--surface-2)] text-[var(--faint)] border border-[var(--line-strong)]";

/**
 * Desktop: after a change, a callout to the left of the panel points at the changed row with
 * «Показати N» and «Скасувати»; it follows the last change and stays until one of them (or Esc).
 * When that row is off screen, a bar pinned to the bottom of the screen takes over.
 */
function DraftCallout({ wrap }: { wrap: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useI18n();
  const { dirty, pending, anchor, view, apply, cancel } = useNav();
  const desk = useMedia("(min-width: 1280px)");
  const reduce = useReducedMotion();
  const show = desk && dirty && !pending;
  const [pos, setPos] = useState<{ top: number; onScreen: boolean } | null>(null);
  useEscape(show, cancel);

  useLayoutEffect(() => {
    const box = wrap.current;
    if (!show || !box) return;
    const measure = () => {
      if (!anchor || !anchor.isConnected || !box.contains(anchor)) return setPos(null);
      const a = anchor.getBoundingClientRect();
      const w = box.getBoundingClientRect();
      setPos({ top: Math.round(a.top - w.top + a.height / 2), onScreen: a.bottom > headerHeight() + 8 && a.top < window.innerHeight - 8 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [show, anchor, view, wrap]);

  const total = view?.total ?? 0;
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 460, damping: 36 };
  const inline = show && pos?.onScreen;
  const bar = show && !pos?.onScreen;

  return (
    <>
      <AnimatePresence>
        {inline && (
          <motion.div
            key="callout"
            role="group"
            aria-label={t("catalog.draftChanged")}
            initial={{ opacity: 0, x: 10, y: "-50%", top: pos.top }}
            animate={{ opacity: 1, x: 0, y: "-50%", top: pos.top }}
            exit={{ opacity: 0, x: 10, transition: { duration: reduce ? 0 : 0.12 } }}
            transition={spring}
            className="absolute right-[calc(100%+14px)] z-30"
          >
            <div className="relative flex items-center gap-1.5 rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] p-1.5 shadow-[0_18px_44px_-10px_rgba(0,0,0,.75)]">
              <span aria-hidden className="absolute -right-[7px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-[var(--line-strong)] bg-[var(--surface-2)]" />
              <button
                type="button"
                onClick={apply}
                disabled={total === 0}
                className={`${applyBtn} ${total > 0 ? "nb-accent nb-press" : applyOff}`}
              >
                {total > 0 ? t("catalog.showN", { n: total }) : t("catalog.empty.title")}
              </button>
              <button
                type="button"
                onClick={cancel}
                className="h-11 rounded-[var(--r)] px-3 text-[13px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
              >
                {t("common.cancel")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {bar && (
          <motion.div
            key="bar"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={spring}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[calc(16px+var(--safe-bottom))]"
          >
            <div
              role="group"
              aria-label={t("catalog.draftChanged")}
              className="pointer-events-auto flex items-center gap-1.5 rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] p-1.5 shadow-[0_18px_44px_-10px_rgba(0,0,0,.8)]"
            >
              <span className="flex items-center gap-2 px-2 text-[13px] font-medium text-[var(--muted)]">
                <span aria-hidden className="tech-mark" />
                {t("catalog.draftChanged")}
              </span>
              <button type="button" onClick={apply} disabled={total === 0} className={`${applyBtn} ${total > 0 ? "nb-accent nb-press" : applyOff}`}>
                {total > 0 ? t("catalog.applyN", { n: total }) : t("catalog.empty.title")}
              </button>
              <button
                type="button"
                onClick={cancel}
                aria-label={t("common.cancel")}
                className="grid h-11 w-11 place-items-center rounded-[var(--r)] text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------- drawer (< 1280 px)

/**
 * «Фільтри (N)» below 1280 px (from 1280 the same panel is the right column). Opens a right drawer
 * on tablets/small laptops and a full-screen sheet on phones. Choices edit the draft — «Знайдено N»
 * in the head and «Показати N товарів» at the foot are recounted live — and leaving the drawer in
 * any way (the button, the cross, Esc, the backdrop, a swipe) applies it and returns to the list.
 */
export function FiltersDrawer({ active, hint }: { active: number; hint?: boolean }) {
  const { t } = useI18n();
  const { pending, dirty, draft, view, setDraft, apply } = useNav();
  const wide = useMedia("(min-width: 768px)");
  const reduce = useReducedMotion();
  const drag = useDragControls();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    if (dirty) apply();
  }, [dirty, apply]);
  useScrollLock(open);
  useEscape(open, close);
  const total = view?.total ?? 0;
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const d = wide ? info.offset.x : info.offset.y;
    const v = wide ? info.velocity.x : info.velocity.y;
    if (d > 120 || v > 600) close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className={`nb-press tap flex h-11 shrink-0 items-center gap-2 rounded-[var(--r)] border px-4 font-display text-[13px] font-bold uppercase tracking-[.06em] xl:hidden ${
          active > 0 ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]" : "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)]"
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" strokeWidth={2.25} />
        {active > 0 ? t("catalog.filtersN", { n: active }) : t("catalog.filters")}
      </button>
      {/* Portal: the trigger sits in the sticky row, whose backdrop-filter would trap position:fixed. */}
      {hydrated && createPortal(
        <AnimatePresence>
          {open && wide && (
            <motion.div
              key="backdrop"
              {...noFadeFlash}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              aria-hidden
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[6px] xl:hidden"
            />
          )}
          {open && (
            <motion.div
              key="panel"
              {...noFadeFlash}
              role="dialog"
              aria-modal="true"
              aria-label={t("catalog.filters")}
              initial={wide ? { x: "100%" } : { y: "100%" }}
              animate={wide ? { x: 0 } : { y: 0 }}
              exit={wide ? { x: "100%" } : { y: "100%" }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 36 }}
              drag={wide ? "x" : "y"}
              dragListener={false}
              dragControls={drag}
              dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
              dragElastic={wide ? { left: 0, right: 0.9 } : { top: 0, bottom: 0.9 }}
              onDragEnd={onDragEnd}
              className={`fixed z-50 flex flex-col bg-[var(--bg)] xl:hidden ${
                wide ? "inset-y-0 right-0 w-[400px] max-w-[90vw] border-l border-[var(--line-strong)] shadow-[-24px_0_60px_rgba(0,0,0,.5)]" : "inset-0"
              }`}
            >
              {/* the head is the drag handle: swipe down (sheet) / right (drawer) to close */}
              <div onPointerDown={(e) => drag.start(e)} className="relative flex touch-none items-center justify-between gap-3 border-b border-[var(--line)] px-4 pb-3 pt-4 select-none">
                {!wide && <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-[var(--line-strong)]" />}
                <div className="min-w-0">
                  <p className="font-display text-[18px] font-extrabold uppercase leading-tight text-[var(--ink)]">
                    {active > 0 ? t("catalog.filtersN", { n: active }) : t("catalog.filters")}
                  </p>
                  <p aria-live="polite" className="mt-0.5 flex items-center gap-2 text-[13px] font-medium text-[var(--muted)]">
                    <span aria-hidden className="tech-mark" />
                    {t("catalog.found", { n: total })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label={t("common.close")}
                  className="tap grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
                >
                  <X className="h-5 w-5" strokeWidth={2.25} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-1">
                <FacetPanel hint={hint} />
              </div>
              <div className="flex gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-4 pb-[calc(12px+var(--safe-bottom))] pt-3">
                {hasFilters(draft) && (
                  <button
                    type="button"
                    onClick={() => setDraft({ q: draft.q })}
                    className="tap flex h-12 shrink-0 items-center rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 font-display text-[13px] font-bold uppercase tracking-[.06em] text-[var(--ink)]"
                  >
                    {t("catalog.resetAll")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (dirty) return close();
                    setOpen(false);
                    requestAnimationFrame(toResults);
                  }}
                  disabled={dirty && total === 0}
                  aria-busy={pending}
                  className={`flex h-12 flex-1 items-center justify-center rounded-[var(--r)] font-display text-[14px] font-bold uppercase tracking-[.06em] ${
                    dirty && total === 0 ? applyOff : "nb-accent nb-press"
                  }`}
                >
                  {pending ? t("common.loading") : dirty && total === 0 ? t("catalog.empty.title") : t("catalog.showN", { n: total })}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
