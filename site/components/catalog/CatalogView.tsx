import type { CatalogSort, PublicCategory, PublicProductPage } from "@shop/shared";
import { ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";
import Link from "next/link";
import { Breadcrumbs, type Crumb } from "@/components/layout/Breadcrumbs";
import { localePath, makeT } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { toCardProducts } from "@/lib/card";
import { PAGE_SIZE } from "@/lib/config";
import { CatalogFilters, CatalogSortSelect, MobileFiltersButton } from "./CatalogFilters";
import { ProductGrid } from "./ProductCard";

export interface CatalogState {
  /** Path without locale, e.g. "/catalog/myshki" or "/search". */
  basePath: string;
  q?: string;
  inStock: boolean;
  /** Minor units. */
  priceMax?: number;
  sort: CatalogSort;
  /** 1-based, as shown in the URL. */
  page: number;
}

/** Builds the URL (without locale) for a catalog state; defaults are left out of the query. */
export function catalogHref(s: CatalogState, patch: Partial<CatalogState> = {}): string {
  const n = { ...s, ...patch };
  const sp = new URLSearchParams();
  if (n.q) sp.set("q", n.q);
  if (n.inStock) sp.set("inStock", "1");
  if (n.priceMax) sp.set("priceMax", String(Math.round(n.priceMax / 100)));
  if (n.sort !== "default") sp.set("sort", n.sort);
  if (n.page > 1) sp.set("page", String(n.page));
  const qs = sp.toString();
  return qs ? `${n.basePath}?${qs}` : n.basePath;
}

/**
 * The catalog screen (server component): breadcrumbs, title, sidebar filters, sort, count, grid,
 * pagination. Shared by /catalog, /catalog/[category] and /search.
 */
export function CatalogView({
  locale,
  title,
  crumbs,
  categories,
  activeCategory,
  state,
  data,
}: {
  locale: Locale;
  title: string;
  crumbs: Crumb[];
  categories: PublicCategory[];
  activeCategory: string | null;
  state: CatalogState;
  data: PublicProductPage | null;
}) {
  const t = makeT(locale);
  const href = (p: string) => localePath(locale, p);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (data?.size || PAGE_SIZE)));
  const filtered = state.inStock || !!state.priceMax;

  const sidebar = (
    <CatalogFilters
      categories={categories}
      activeCategory={activeCategory}
      inStock={state.inStock}
      priceMax={state.priceMax}
      priceMaxAvailable={data?.priceMaxAvailable ?? 0}
      hrefs={{
        all: href(catalogHref({ ...state, basePath: "/catalog", page: 1 })),
        category: Object.fromEntries(
          categories.map((c) => [c.slug, href(catalogHref({ ...state, basePath: `/catalog/${c.slug}`, page: 1 }))])
        ),
        reset: href(catalogHref({ ...state, inStock: false, priceMax: undefined, page: 1 })),
      }}
      showCategories={!state.q}
    />
  );

  return (
    <div className="container-site pt-6">
      <Breadcrumbs locale={locale} items={crumbs} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 font-display text-[28px] font-extrabold uppercase leading-tight tracking-[.02em] text-[var(--ink)] [overflow-wrap:anywhere] sm:text-[38px]">
            {title}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-[14px] font-medium text-[var(--muted)]" aria-live="polite">
            <span aria-hidden className="tech-mark" />
            {t("catalog.count", { n: total })}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <MobileFiltersButton>{sidebar}</MobileFiltersButton>
          <CatalogSortSelect value={state.sort} />
        </div>
      </div>

      <div className="flex gap-8">
        <aside className="hidden w-[250px] shrink-0 lg:block" aria-label={t("catalog.filters")}>
          <div className="sticky top-[140px]">{sidebar}</div>
        </aside>

        <div className="min-w-0 flex-1">
          {!data ? (
            <div className="nb p-8 text-center text-[15px] font-medium text-[var(--muted)]">{t("catalog.error")}</div>
          ) : data.items.length === 0 ? (
            <div className="nb hud-frame flex flex-col items-center gap-3 px-6 py-14 text-center">
              <PackageSearch className="h-10 w-10 text-[var(--accent)]" strokeWidth={1.75} />
              <p className="text-[18px] font-display font-extrabold uppercase text-[var(--ink)]">{t("catalog.empty.title")}</p>
              <p className="max-w-sm text-[14px] font-medium text-[var(--muted)]">{t("catalog.empty.text")}</p>
              {filtered && (
                <Link href={href(catalogHref({ ...state, inStock: false, priceMax: undefined, page: 1 }))} className="link-ink mt-2 text-[14px] font-semibold">
                  {t("catalog.reset")}
                </Link>
              )}
            </div>
          ) : (
            <>
              <ProductGrid products={toCardProducts(data.items)} priorityCount={4} />
              {pages > 1 && <Pagination locale={locale} state={state} pages={pages} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Pagination({ locale, state, pages }: { locale: Locale; state: CatalogState; pages: number }) {
  const t = makeT(locale);
  const href = (page: number) => localePath(locale, catalogHref(state, { page }));
  const cur = state.page;
  const nums = pageWindow(cur, pages);
  const cell =
    "grid h-11 min-w-11 place-items-center rounded-[var(--r)] border px-3 font-display text-[14px] font-bold tabular-nums transition-colors";
  return (
    <nav aria-label={t("catalog.pagination")} className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {cur > 1 ? (
        <Link href={href(cur - 1)} rel="prev" className={`${cell} border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]`}>
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
          <span className="sr-only">{t("catalog.prev")}</span>
        </Link>
      ) : null}
      {nums.map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} className="px-1 font-display font-extrabold text-[var(--muted)]">
            …
          </span>
        ) : (
          <Link
            key={n}
            href={href(n)}
            aria-current={n === cur ? "page" : undefined}
            aria-label={t("catalog.page", { n })}
            className={`${cell} ${
              n === cur
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
            }`}
          >
            {n}
          </Link>
        )
      )}
      {cur < pages ? (
        <Link href={href(cur + 1)} rel="next" className={`${cell} border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]`}>
          <span className="sr-only">{t("catalog.next")}</span>
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </Link>
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
