import { activeFilterCount, type Facet, type Locale } from "@shop/shared";
import { ChevronLeft, ChevronRight, PackageSearch, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/layout/Breadcrumbs";
import { localePath, makeT } from "@/i18n";
import { type CardContext, toCardProducts } from "@/lib/card";
import { type Listing, type MenuNode } from "@/lib/catalog";
import { type CatalogState, clearFilters, hasFilters } from "@/lib/catalog-params";
import { DragScroller } from "@/components/ui/DragScroller";
import { CatalogNavProvider, CatalogSortSelect, FilterSidebar, FiltersDrawer, FoundCount, PendingRegion, RESULTS_ID, StateLink } from "./CatalogFilters";
import { ProductGrid } from "./ProductCard";

export type { CatalogState };

/**
 * The catalog screen (server component), shared by /catalog, /catalog/[category] and /search:
 * breadcrumbs, H1, subcategory chips, then a left column (category tree + facets) and the results
 * (active filter chips, «Знайдено N», sort, grid, pagination). docs/CATALOG-SPECS.md §5 «Сайт».
 */
export function CatalogView({
  locale,
  title,
  crumbs,
  state,
  listing,
  tree,
  activeSlug,
  chips,
  hint,
  card,
  footer,
}: {
  locale: Locale;
  title: string;
  crumbs: Crumb[];
  state: CatalogState;
  listing: Listing | null;
  /** Root categories with their children (empty ones already dropped). */
  tree: MenuNode[];
  /** Category of the page (root, leaf or "utsenka"); null = all products / search. */
  activeSlug: string | null;
  /** Subcategory chips above the grid (a root's children), with the root itself as «Усі». */
  chips?: { root: MenuNode; children: MenuNode[] } | null;
  /** No category: say that characteristic filters need one. */
  hint?: boolean;
  card: CardContext;
  /** Rendered under the grid and pagination (the category SEO text, see CategoryIntro). */
  footer?: ReactNode;
}) {
  const t = makeT(locale);
  const total = listing?.total ?? 0;
  const facets = listing?.facets ?? [];
  const active = activeFilterCount(state.filter);
  const filtered = hasFilters(state.filter);
  const reset = clearFilters(state);

  /*
   * Layout (owner's brief, 2026-10-09):
   *   ≥1280  categories 240 | grid (3 cols) | filters 280 — no scroll of its own: sticks under the
   *          header when short, scrolls with the page and sticks by its bottom when long
   *   1024+  categories | grid; filters in a right drawer behind «Фільтри (N)»
   *   768+   grid only (categories: chips row + header menu); filters in the right drawer
   *   <768   the same, filters in a full-screen sheet
   * Categories are navigation, never inside the filter panel. Filter choices are a draft until
   * «Показати N» (see CatalogFilters); below 1280 the «Фільтри · sort» row sticks under the header.
   */
  return (
    <CatalogNavProvider state={state} engine={listing?.engine ?? null}>
      <div className="container-site pt-6">
        <Breadcrumbs locale={locale} items={crumbs} />
        <div className="mb-5">
          <h1 className="font-display text-[28px] font-extrabold uppercase leading-tight tracking-[.02em] text-[var(--ink)] [overflow-wrap:anywhere] sm:text-[38px]">
            {title}
          </h1>
        </div>

        {chips && chips.children.length > 0 && <SubcategoryChips locale={locale} chips={chips} activeSlug={activeSlug} />}

        <div className="flex gap-6">
          <aside className="hidden w-[240px] shrink-0 lg:block" aria-label={t("catalog.categories")}>
            <CategoryTree locale={locale} tree={tree} activeSlug={activeSlug} />
          </aside>

          <div className="min-w-0 flex-1">
            {/* where a new selection or page scrolls back to (only when it is above the screen) */}
            <div id={RESULTS_ID} aria-hidden className="h-0" />
            {/* top row: Фільтри (N) below 1280 · found N · sort; sticky under the header below 1280 */}
            <div className="sticky top-[var(--header-h)] z-30 -mx-4 mb-1 flex items-center gap-2 bg-[var(--bg)]/95 px-4 py-2 backdrop-blur-[10px] sm:gap-3 md:-mx-6 md:px-6 lg:mx-0 lg:px-0 xl:static xl:mb-3 xl:bg-transparent xl:py-0 xl:backdrop-blur-none">
              <FiltersDrawer active={active} hint={hint} />
              <FoundCount total={total} className="hidden sm:flex" />
              <div className="ml-auto flex min-w-0 flex-1 justify-end sm:flex-none">
                <CatalogSortSelect state={state} />
              </div>
            </div>
            <FoundCount total={total} className="mb-3 sm:hidden" />

            {filtered && <ActiveFilters locale={locale} state={state} facets={facets} reset={reset} />}

            <PendingRegion>
              {!listing ? (
                <div className="nb p-8 text-center text-[15px] font-medium text-[var(--muted)]">{t("catalog.error")}</div>
              ) : listing.items.length === 0 ? (
                <div className="nb hud-frame flex flex-col items-center gap-3 px-6 py-14 text-center">
                  <PackageSearch className="h-10 w-10 text-[var(--accent)]" strokeWidth={1.75} />
                  <p className="font-display text-[18px] font-extrabold uppercase text-[var(--ink)]">{t("catalog.empty.title")}</p>
                  <p className="max-w-sm text-[14px] font-medium text-[var(--muted)]">{t("catalog.empty.text")}</p>
                  {filtered && (
                    <StateLink state={reset} className="link-ink mt-2 text-[14px] font-semibold">
                      {t("catalog.reset")}
                    </StateLink>
                  )}
                </div>
              ) : (
                <>
                  <ProductGrid products={toCardProducts(listing.items, card)} priorityCount={3} cols="grid-cols-2 md:grid-cols-3" />
                  {listing.pages > 1 && <Pagination locale={locale} state={{ ...state, page: listing.page }} pages={listing.pages} />}
                </>
              )}
            </PendingRegion>
            {footer}
          </div>

          <aside className="hidden w-[280px] shrink-0 xl:block" aria-label={t("catalog.filters")}>
            <FilterSidebar hint={hint} resetState={filtered ? reset : null} />
          </aside>
        </div>
      </div>
    </CatalogNavProvider>
  );
}

// ---------------------------------------------------------------- category tree

/**
 * «Категорії» card: «Усі товари» + the roots with counts; the selected root (or the root of the
 * selected leaf) unfolds its subcategories as an indented tree with a guide line. Plain links, the
 * clean category URLs (filters are not carried over — characteristic facets differ per category).
 */
function CategoryTree({ locale, tree, activeSlug }: { locale: Locale; tree: MenuNode[]; activeSlug: string | null }) {
  const t = makeT(locale);
  const href = (p: string) => localePath(locale, p);
  if (tree.length === 0) return null;
  return (
    <nav className="nb p-4" aria-label={t("catalog.categories")}>
      <h2 className="eyebrow mb-3 flex items-center gap-2 text-[11px]">
        <span aria-hidden className="h-[2px] w-3 bg-[var(--accent)]" />
        {t("catalog.categories")}
      </h2>
      <ul className="flex flex-col gap-1">
        <li>
          <TreeLink href={href("/catalog")} active={!activeSlug}>
            {t("catalog.all")}
          </TreeLink>
        </li>
        {tree.map((root) => {
          const open = root.slug === activeSlug || root.children.some((c) => c.slug === activeSlug);
          return (
            <li key={root.id}>
              <TreeLink href={href(`/catalog/${root.slug}`)} active={root.slug === activeSlug} inPath={open && root.slug !== activeSlug} count={root.productCount}>
                {root.name}
              </TreeLink>
              {open && root.children.length > 0 && (
                <ul className="relative ml-3 mt-1 flex flex-col gap-0.5 border-l border-[var(--line-strong)] pl-2.5">
                  {root.children.map((c) => (
                    <li key={c.id}>
                      <TreeLink href={href(`/catalog/${c.slug}`)} active={c.slug === activeSlug} count={c.productCount} small>
                        {c.name}
                      </TreeLink>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function TreeLink({
  href,
  active,
  inPath,
  count,
  small,
  children,
}: {
  href: string;
  active: boolean;
  /** The root of the selected leaf. */
  inPath?: boolean;
  count?: number;
  small?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between gap-2 rounded-[var(--r)] border px-2.5 py-1 font-medium transition-colors ${small ? "min-h-8 text-[13px]" : "min-h-9 text-[14px]"} ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : inPath
            ? "border-transparent text-[var(--ink)] hover:bg-[var(--surface-2)]"
            : "border-transparent text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
      }`}
    >
      <span className="min-w-0 truncate">{children}</span>
      {count !== undefined && <span className="shrink-0 font-display text-[12px] tabular-nums opacity-70">{count}</span>}
    </Link>
  );
}

function SubcategoryChips({ locale, chips, activeSlug }: { locale: Locale; chips: { root: MenuNode; children: MenuNode[] }; activeSlug: string | null }) {
  const t = makeT(locale);
  const href = (p: string) => localePath(locale, p);
  const chip = "nb-chip inline-flex min-h-10 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full px-4 font-display text-[13px] font-semibold transition-colors";
  const items = [{ slug: chips.root.slug, name: t("catalog.allIn", { name: chips.root.name }), count: chips.root.productCount }, ...chips.children.map((c) => ({ slug: c.slug, name: c.name, count: c.productCount }))];
  return (
    <nav aria-label={t("catalog.subcategories")} className="-mx-4 mb-5 md:-mx-6 lg:mx-0">
      <DragScroller className="flex gap-2 px-4 scroll-px-4 md:px-6 md:scroll-px-6 lg:px-0 lg:scroll-px-0">
        {items.map((c) => {
          const on = c.slug === activeSlug;
          return (
            <Link
              key={c.slug}
              href={href(`/catalog/${c.slug}`)}
              aria-current={on ? "page" : undefined}
              data-active={on || undefined}
              draggable={false}
              className={`${chip} ${on ? "nb-chip-active" : "text-[var(--ink)] hover:border-[var(--line-strong)]"}`}
            >
              {c.name}
              <span className="font-display text-[12px] tabular-nums opacity-60">{c.count}</span>
            </Link>
          );
        })}
      </DragScroller>
    </nav>
  );
}

// ---------------------------------------------------------------- active filters

function ActiveFilters({ locale, state, facets, reset }: { locale: Locale; state: CatalogState; facets: Facet[]; reset: CatalogState }) {
  const t = makeT(locale);
  const f = state.filter;
  const nf = new Intl.NumberFormat(locale === "en" ? "en-US" : locale === "ru" ? "ru-RU" : "uk-UA", { maximumFractionDigits: 3 });
  const range = (min: number | null | undefined, max: number | null | undefined, unit?: string | null) => {
    const u = unit ? ` ${unit}` : "";
    if (min != null && max != null) return `${nf.format(min)}–${nf.format(max)}${u}`;
    if (min != null) return t("catalog.rangeFrom", { v: `${nf.format(min)}${u}` });
    return t("catalog.rangeTo", { v: `${nf.format(max ?? 0)}${u}` });
  };
  const chips: { key: string; label: string; state: CatalogState }[] = [];
  const next = (filter: typeof f): CatalogState => ({ ...state, filter, page: 1 });

  if (f.inStock) chips.push({ key: "stock", label: t("catalog.inStock"), state: next({ ...f, inStock: false }) });
  if (f.priceMin != null || f.priceMax != null) {
    chips.push({ key: "price", label: `${t("catalog.price").replace(/,.*$/, "")}: ${range(f.priceMin, f.priceMax, "₴")}`, state: next({ ...f, priceMin: null, priceMax: null }) });
  }
  for (const facet of facets) {
    if (facet.kind === "range") {
      if (facet.selectedRange) {
        const attrs = { ...(f.attrs ?? {}) };
        delete attrs[facet.key];
        chips.push({ key: facet.key, label: `${facet.label}: ${range(facet.selectedRange.min, facet.selectedRange.max, facet.unit)}`, state: next({ ...f, attrs }) });
      }
      continue;
    }
    for (const v of facet.values.filter((x) => x.selected)) {
      let filter = f;
      if (facet.key === "brand") filter = { ...f, brands: (f.brands ?? []).filter((x) => x !== v.value) };
      else if (facet.key === "cond") filter = { ...f, conditions: (f.conditions ?? []).filter((x) => x !== v.value) };
      else filter = { ...f, attrs: { ...(f.attrs ?? {}), [facet.key]: (f.attrs?.[facet.key] ?? []).filter((x) => x !== v.value) } };
      const label = facet.kind === "bool" ? facet.label : facet.key === "brand" || facet.key === "cond" ? v.label : `${facet.label}: ${v.label}`;
      chips.push({ key: `${facet.key}:${v.value}`, label, state: next(filter) });
    }
  }
  if (chips.length === 0) return null;
  // Phones: one swipeable row (DragScroller); from 768 px the chips wrap.
  return (
    <DragScroller className="-mx-4 mb-4 px-4 scroll-px-4 md:mx-0 md:px-0 md:scroll-px-0">
    <ul className="flex w-max items-center gap-2 md:w-auto md:flex-wrap">
      {chips.map((c) => (
        <li key={c.key} className="shrink-0 snap-start">
          <StateLink
            state={c.state}
            aria-label={t("catalog.removeFilter", { label: c.label })}
            className="nb-chip nb-chip-active inline-flex min-h-9 items-center gap-1.5 rounded-full pl-3 pr-2 text-[13px] font-semibold transition-colors hover:bg-[rgba(255,102,0,.2)]"
          >
            <span className="max-w-[240px] truncate">{c.label}</span>
            <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2.75} />
          </StateLink>
        </li>
      ))}
      <li>
        <StateLink state={reset} className="link-ink whitespace-nowrap px-1 text-[13px] font-semibold text-[var(--muted)]">
          {t("catalog.resetAll")}
        </StateLink>
      </li>
    </ul>
    </DragScroller>
  );
}

// ---------------------------------------------------------------- pagination

function Pagination({ locale, state, pages }: { locale: Locale; state: CatalogState; pages: number }) {
  const t = makeT(locale);
  const at = (page: number): CatalogState => ({ ...state, page });
  const cur = state.page;
  const nums = pageWindow(cur, pages);
  const cell =
    "grid h-11 min-w-11 place-items-center rounded-[var(--r)] border px-3 font-display text-[14px] font-bold tabular-nums transition-colors";
  return (
    <nav aria-label={t("catalog.pagination")} className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {cur > 1 ? (
        <StateLink state={at(cur - 1)} toResults rel="prev" className={`${cell} border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]`}>
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
          <span className="sr-only">{t("catalog.prev")}</span>
        </StateLink>
      ) : null}
      {nums.map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} className="px-1 font-display font-extrabold text-[var(--muted)]">
            …
          </span>
        ) : (
          <StateLink
            key={n}
            state={at(n)}
            toResults
            aria-current={n === cur ? "page" : undefined}
            aria-label={t("catalog.page", { n })}
            className={`${cell} ${
              n === cur
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
            }`}
          >
            {n}
          </StateLink>
        )
      )}
      {cur < pages ? (
        <StateLink state={at(cur + 1)} toResults rel="next" className={`${cell} border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]`}>
          <span className="sr-only">{t("catalog.next")}</span>
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </StateLink>
      ) : null}
    </nav>
  );
}

/** 1 … 4 5 [6] 7 8 … 20 */
function pageWindow(cur: number, pages: number): (number | null)[] {
  const out: (number | null)[] = [];
  const add = (n: number) => {
    if (n >= 1 && n <= pages && !out.includes(n)) out.push(n);
  };
  add(1);
  if (cur - 2 > 2) out.push(null);
  for (let n = cur - 2; n <= cur + 2; n++) add(n);
  if (cur + 2 < pages - 1) out.push(null);
  add(pages);
  return out;
}
