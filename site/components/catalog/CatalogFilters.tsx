"use client";

/**
 * Catalog v2 filters (docs/CATALOG-SPECS.md §5 «Сайт»): the facet panel (right column from 1280 px,
 * a drawer/sheet below), the sort dropdown and the navigation that ties them to the URL.
 *
 * All state lives in the query string in the shared format (`filterToParams`), so a filtered page
 * is server-rendered, shareable and works without JS: every option is a real link (rel=nofollow —
 * filter combinations are noindex anyway). With JS the click becomes `router.replace` without a
 * scroll jump, inside a transition, so the grid dims while the server renders the new selection.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useState, useTransition } from "react";
import { type CatalogFilter, type CatalogSort, type Facet, noFadeFlash, toggleFacet } from "@shop/shared";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n";
import { type CatalogState, catalogHref, SORTS } from "@/lib/catalog-params";
import { useEscape, useScrollLock } from "@/lib/hooks";

// ---------------------------------------------------------------- navigation

interface Nav {
  pending: boolean;
  /** Locale-prefixed URL of a state. */
  url: (s: CatalogState) => string;
  go: (s: CatalogState) => void;
}

const NavContext = createContext<Nav | null>(null);

/** Wraps the catalog screen: one transition for every filter control and the dimmed grid. */
export function CatalogNavProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { href } = useI18n();
  const [pending, start] = useTransition();
  const url = useCallback((s: CatalogState) => href(catalogHref(s)), [href]);
  const go = useCallback((s: CatalogState) => start(() => router.replace(url(s), { scroll: false })), [router, url]);
  return <NavContext.Provider value={{ pending, url, go }}>{children}</NavContext.Provider>;
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

/** A real link to a state; plain click → client navigation without scrolling. */
export function StateLink({
  state,
  className,
  children,
  ...rest
}: { state: CatalogState; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const { url, go } = useNav();
  return (
    <a
      href={url(state)}
      rel="nofollow"
      className={className}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(state);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

const withFilter = (s: CatalogState, filter: CatalogFilter): CatalogState => ({ ...s, filter, page: 1 });

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

// ---------------------------------------------------------------- facet panel

const SHOW_FIRST = 6;
const COLLAPSE_AFTER = 8;
/** Sections open by default (the rest open when they hold a selection). */
const OPEN_SECTIONS = 6;

export function FacetPanel({
  state,
  facets,
  price,
  hint,
}: {
  state: CatalogState;
  facets: Facet[];
  price: { min: number; max: number } | null;
  /** /catalog and search: no category → no characteristic facets, say why. */
  hint?: boolean;
}) {
  const { t } = useI18n();
  const f = state.filter;
  return (
    <div className="flex flex-col">
      <Section title={t("catalog.availability")} open>
        <OptionRow
          state={withFilter(state, { ...f, inStock: !f.inStock })}
          selected={!!f.inStock}
          label={t("catalog.inStock")}
        />
      </Section>
      {price && (price.max > price.min || f.priceMin != null || f.priceMax != null) && (
        <Section title={t("catalog.price")} open selected={f.priceMin != null || f.priceMax != null}>
          <RangeForm
            min={price.min}
            max={price.max}
            from={f.priceMin ?? null}
            to={f.priceMax ?? null}
            onApply={(a, b) => withFilter(state, { ...f, priceMin: a, priceMax: b })}
          />
        </Section>
      )}
      {facets.map((facet, i) => {
        const selected = facet.kind === "range" ? !!facet.selectedRange : facet.values.some((v) => v.selected);
        return (
          <Section key={facet.key} title={facet.unit && facet.kind !== "options" ? `${facet.label}, ${facet.unit}` : facet.label} open={i < OPEN_SECTIONS || selected} selected={selected}>
            {facet.kind === "range" ? (
              <RangeForm
                min={facet.min ?? 0}
                max={facet.max ?? 0}
                from={facet.selectedRange?.min ?? null}
                to={facet.selectedRange?.max ?? null}
                onApply={(a, b) => {
                  const attrs = { ...(f.attrs ?? {}) };
                  if (a == null && b == null) delete attrs[facet.key];
                  else attrs[facet.key] = [`${a ?? ""}..${b ?? ""}`];
                  return withFilter(state, { ...f, attrs });
                }}
              />
            ) : (
              <OptionList state={state} facet={facet} />
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

function OptionList({ state, facet }: { state: CatalogState; facet: Facet }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const long = facet.values.length > COLLAPSE_AFTER;
  const shown = !long || all ? facet.values : facet.values.filter((v, i) => i < SHOW_FIRST || v.selected);
  return (
    <ul className="flex flex-col gap-0.5">
      {shown.map((v) => {
        const next =
          facet.kind === "bool"
            ? { ...state.filter, attrs: { ...(state.filter.attrs ?? {}), [facet.key]: v.selected ? [] : ["1"] } }
            : toggleFacet(state.filter, facet.key, v.value);
        return (
          <li key={v.value}>
            <OptionRow
              state={withFilter(state, next)}
              selected={v.selected}
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

function OptionRow({ state, selected, label, count }: { state: CatalogState; selected: boolean; label: string; count?: number }) {
  const disabled = !selected && count === 0;
  return (
    <StateLink
      state={state}
      role="checkbox"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      className={`group/opt flex min-h-9 items-center gap-2.5 rounded-[var(--r)] px-1.5 text-[14px] font-medium transition-colors hover:bg-[var(--surface-2)] ${
        selected ? "text-[var(--ink)]" : disabled ? "pointer-events-none text-[var(--faint)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
      }`}
    >
      <span
        aria-hidden
        className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors ${
          selected ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--line-strong)] bg-[var(--surface-2)] group-hover/opt:border-[rgba(255,255,255,.3)]"
        }`}
      >
        {selected && <Check className="h-3 w-3 text-[var(--accent-ink)]" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="shrink-0 font-display text-[12px] tabular-nums text-[var(--faint)]">{count}</span>}
    </StateLink>
  );
}

function RangeForm({
  min,
  max,
  from,
  to,
  onApply,
}: {
  min: number;
  max: number;
  from: number | null;
  to: number | null;
  onApply: (from: number | null, to: number | null) => CatalogState;
}) {
  const { t } = useI18n();
  const { go } = useNav();
  const [a, setA] = useState(from != null ? String(from) : "");
  const [b, setB] = useState(to != null ? String(to) : "");
  useEffect(() => setA(from != null ? String(from) : ""), [from]);
  useEffect(() => setB(to != null ? String(to) : ""), [to]);
  const num = (s: string) => {
    const n = Number(s.replace(",", ".").trim());
    return s.trim() !== "" && Number.isFinite(n) ? n : null;
  };
  const input =
    "h-10 w-full min-w-0 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 font-display text-[14px] font-semibold tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        let lo = num(a);
        let hi = num(b);
        if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
        // A bound equal to the edge of the data is no filter.
        if (lo != null && lo <= min) lo = null;
        if (hi != null && hi >= max) hi = null;
        go(onApply(lo, hi));
      }}
      className="flex items-center gap-2"
    >
      <input type="text" inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} placeholder={`${t("catalog.from")} ${min}`} aria-label={t("catalog.from")} className={input} />
      <span aria-hidden className="text-[var(--faint)]">–</span>
      <input type="text" inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} placeholder={`${t("catalog.to")} ${max}`} aria-label={t("catalog.to")} className={input} />
      <button
        type="submit"
        aria-label={t("catalog.apply")}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
      >
        <Check className="h-4 w-4" strokeWidth={2.75} />
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- drawer (< 1280 px)

/** ≥ 768 px: the panel slides in from the right; below that it is a full-screen sheet. */
function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/**
 * «Фільтри (N)» below 1280 px (from 1280 the same panel is the right column). Opens a right drawer
 * on tablets/small laptops and a full-screen sheet on phones. Choices apply at once — the counts
 * and «Показати N товарів» update live — and it stays open until the visitor is done.
 */
export function FiltersDrawer({
  active,
  total,
  resetState,
  children,
}: {
  active: number;
  total: number;
  /** The state without filters, or null when nothing is set. */
  resetState: CatalogState | null;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const { pending } = useNav();
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useScrollLock(open);
  useEscape(open, close);

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
              transition={{ type: "spring", stiffness: 340, damping: 36 }}
              className={`fixed z-50 flex flex-col bg-[var(--bg)] xl:hidden ${
                wide ? "inset-y-0 right-0 w-[400px] max-w-[90vw] border-l border-[var(--line-strong)] shadow-[-24px_0_60px_rgba(0,0,0,.5)]" : "inset-0"
              }`}
            >
              <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
                <p className="font-display text-[18px] font-extrabold uppercase text-[var(--ink)]">
                  {active > 0 ? t("catalog.filtersN", { n: active }) : t("catalog.filters")}
                </p>
                <button
                  type="button"
                  onClick={close}
                  aria-label={t("common.close")}
                  className="tap grid h-11 w-11 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
                >
                  <X className="h-5 w-5" strokeWidth={2.25} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-1">{children}</div>
              <div className="flex gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-4 pb-[calc(12px+var(--safe-bottom))] pt-3">
                {resetState && (
                  <StateLink
                    state={resetState}
                    className="tap flex h-12 shrink-0 items-center rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 font-display text-[13px] font-bold uppercase tracking-[.06em] text-[var(--ink)]"
                  >
                    {t("catalog.resetAll")}
                  </StateLink>
                )}
                <button
                  type="button"
                  onClick={close}
                  aria-busy={pending}
                  className="nb-accent nb-press flex h-12 flex-1 items-center justify-center rounded-[var(--r)] font-display text-[14px] font-bold uppercase tracking-[.06em]"
                >
                  {pending ? t("common.loading") : t("catalog.showN", { n: total })}
                </button>
              </div>
            </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
