"use client";

/**
 * SHOP catalog — ChiSetup (v3).
 * Catalog v2: everything comes from ["products"] + the schema (["catalogSchema", locale]);
 * filtering/facets go through the shared engine (filterProducts), sort is applied after it. Tap →
 * ProductView. Sorting: out-of-stock always sink to the bottom; default orders
 * by bestseller (soldCount). A sort menu sits next to search. Tag row supports
 * mouse drag + wheel horizontal scroll on desktop.
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowDownAZ,
  ArrowDownNarrowWide,
  ArrowDownUp,
  ArrowUpNarrowWide,
  Check,
  Flame,
  PackageOpen,
  Search,
  SlidersHorizontal,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ProductCard } from "@/components/catalog/ProductCard";
import { Logo } from "@/components/Logo";
import { ProductCardSkeleton } from "@/components/catalog/ProductCardSkeleton";
import { ProductView } from "@/components/catalog/ProductView";
import { FilterSheet, activeFilterChips } from "@/components/catalog/FilterSheet";
import { NotificationsBell } from "@/components/NotificationsBell";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Toast } from "@/components/ui/Toast";
import {
  activeFilterCount,
  categoryBySlug,
  categoryPath,
  childCategories,
  filterForCategory,
  filterProducts,
  getActiveTag,
  MARKDOWN_COLLECTION_SLUG,
  specSummary,
} from "@shop/shared";
import { useI18n } from "@/i18n/context";
import { customerApi, type Product } from "@/lib/api";
import { EMPTY_FILTER, EMPTY_SCHEMA, productInStock, toEngineItems, useCatalogSchema, useStoredFilter } from "@/lib/catalog";
import { spring } from "@/lib/motion";
import { haptic } from "@/lib/telegram";

/** Cards that rise in on mount — a first screenful; the rest just appear. */
const ANIMATED_CARDS = 6;

type SortKey = "popular" | "price_asc" | "price_desc" | "name";

const SORTS: { key: SortKey; labelKey: string; Icon: typeof Flame }[] = [
  { key: "popular", labelKey: "catalog.sort.popular", Icon: Flame },
  { key: "price_asc", labelKey: "catalog.sort.priceAsc", Icon: ArrowUpNarrowWide },
  { key: "price_desc", labelKey: "catalog.sort.priceDesc", Icon: ArrowDownNarrowWide },
  { key: "name", labelKey: "catalog.sort.name", Icon: ArrowDownAZ },
];

/** "Клавиатуры" → "клавиатуры" for "Все клавиатуры"; acronyms ("IEM") stay as they are. */
function lowerFirst(s: string): string {
  return s.length > 1 && s[1] === s[1].toLocaleLowerCase() ? s[0].toLocaleLowerCase() + s.slice(1) : s;
}

export default function CatalogPage() {
  const { t, locale, tag: localeTag } = useI18n();
  const [selected, setSelected] = useState<Product | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useStoredFilter();
  const [sort, setSort] = useState<SortKey>("popular");
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const schemaQuery = useCatalogSchema();
  const schema = schemaQuery.data ?? EMPTY_SCHEMA;

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["products"],
    queryFn: () => customerApi.getProducts(),
  });

  const products = useMemo(() => data ?? [], [data]);

  const items = useMemo(() => toEngineItems(products), [products]);

  // A stored category that no longer exists (renamed/emptied) is ignored, not a blank screen.
  const category =
    filter.category === MARKDOWN_COLLECTION_SLUG || categoryBySlug(schema, filter.category) ? (filter.category ?? null) : null;
  const effective = useMemo(() => ({ ...filter, category, q: search.trim() || undefined }), [filter, category, search]);

  // Level 1: roots in sortOrder (in the menu, with products) · "Уценка" last if anything is not new.
  const roots = useMemo(
    () => childCategories(schema, null).filter((c) => c.showInMenu && c.productCount > 0),
    [schema],
  );
  const hasMarkdown = useMemo(() => products.some((p) => p.condition && p.condition !== "NEW"), [products]);
  const activeRoot =
    category && category !== MARKDOWN_COLLECTION_SLUG ? (categoryPath(schema, categoryBySlug(schema, category)?.id)[0] ?? null) : null;
  const children = useMemo(
    () => (activeRoot ? childCategories(schema, activeRoot.id).filter((c) => c.showInMenu && c.productCount > 0) : []),
    [schema, activeRoot],
  );

  const sorted = useMemo(() => {
    const list = filterProducts(schema, items, effective).map((x) => x.src);
    return list.sort((a, b) => {
      // Out-of-stock always sinks to the bottom.
      const ai = productInStock(a) ? 0 : 1;
      const bi = productInStock(b) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      switch (sort) {
        case "price_asc":
          return a.priceMinor - b.priceMinor;
        case "price_desc":
          return b.priceMinor - a.priceMinor;
        case "name":
          return a.title.localeCompare(b.title, getActiveTag());
        case "popular":
        default:
          return (b.soldCount ?? 0) - (a.soldCount ?? 0) || a.title.localeCompare(b.title, getActiveTag());
      }
    });
  }, [schema, items, effective, sort]);

  const summaries = useMemo(() => {
    const yesNo: [string, string] = [t("catalog.yes"), t("catalog.no")];
    const m = new Map<string, string>();
    if (schema.attributes.length === 0) return m;
    for (const p of products) {
      const line = specSummary(schema, p.categoryId, p.specs, locale, yesNo);
      if (line) m.set(p.id, line);
    }
    return m;
  }, [schema, products, locale, t]);

  const filterCount = activeFilterCount(filter);
  const activeChips = useMemo(() => activeFilterChips(schema, filter, t, localeTag), [schema, filter, t, localeTag]);

  const selectCategory = (slug: string | null) => {
    haptic();
    setFilter((f) => filterForCategory(f, slug));
  };

  const showControls = !isLoading && !isError && products.length > 0;
  const fireToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  return (
    <div className="min-h-full" style={{ marginTop: "calc(-1 * max(16px, var(--safe-top)))" }}>
      {/* ── HEADER ─────────────────────────────────────────────────────────
          Only the controls (search · sort · categories) stick. The brand row above them scrolls
          away with the list — it cost ~70px of a phone screen on every scroll position. Neither
          part changes height, so the list never jumps. */}
      <div
        className="-mx-4 px-4 pb-1"
        style={{ paddingTop: "max(12px, var(--safe-top))", background: "rgba(14,14,16,.86)" }}
      >
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {/* Same wordmark as the website header — one identity across site and Telegram. */}
            <h1 className="leading-none" aria-label="ChiSetup">
              <Logo size="lg" />
            </h1>
            <p className="mt-1.5 truncate text-[12px] font-medium text-[var(--muted)]">
              {t("catalog.tagline")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NotificationsBell />
            <LanguageToggle />
          </div>
        </header>
      </div>

      {/* ── STICKY CONTROLS ──────────────────────────────────────────────
          They stick just under the safe area (Telegram fullscreen: status bar + its buttons), which a
          fixed strip of header colour covers — padding them by --safe-top instead doubled that gap
          under the brand row while nothing was scrolled yet. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-30 backdrop-blur-[12px]"
        style={{ height: "var(--safe-top)", background: "rgba(14,14,16,.86)" }}
      />
      <div
        className="sticky z-30 -mx-4 border-b border-[var(--line)] px-4 pb-2.5 pt-2 backdrop-blur-[12px]"
        style={{ top: "var(--safe-top)", background: "rgba(14,14,16,.86)" }}
      >
        {showControls && (
          <>
            <div className="flex items-stretch gap-2">
              <div className="flex flex-1 items-center gap-2.5 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
                <Search className="h-[18px] w-[18px] shrink-0 text-[var(--muted)]" strokeWidth={2.25} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("catalog.search")}
                  aria-label={t("catalog.search")}
                  enterKeyHint="search"
                  className="w-full min-h-0 bg-transparent text-[15px] font-medium text-[var(--ink)] outline-none placeholder:font-normal placeholder:text-[var(--faint)]"
                />
                {search && (
                  <button
                    type="button"
                    aria-label={t("catalog.searchClear")}
                    onClick={() => {
                      haptic();
                      setSearch("");
                    }}
                    className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                )}
              </div>

              {/* filters */}
              <button
                type="button"
                aria-label={t("catalog.filters")}
                onClick={() => {
                  haptic();
                  setSortOpen(false);
                  setFiltersOpen(true);
                }}
                className={`nb-press tap relative grid w-[52px] shrink-0 place-items-center rounded-[var(--r)] border ${
                  filterCount > 0
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                    : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
                }`}
              >
                <SlidersHorizontal className="h-5 w-5" strokeWidth={2.25} />
                {filterCount > 0 && (
                  <span className="font-display absolute -right-1.5 -top-1.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10.5px] font-bold leading-none text-[var(--accent-ink)]">
                    {filterCount}
                  </span>
                )}
              </button>

              {/* sort */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  aria-label={t("catalog.sort")}
                  onClick={() => {
                    haptic();
                    setSortOpen((o) => !o);
                  }}
                  className={`nb-press tap grid h-full w-[52px] place-items-center rounded-[var(--r)] border ${
                    sort !== "popular"
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                      : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
                  }`}
                >
                  <ArrowDownUp className="h-5 w-5" strokeWidth={2.25} />
                </button>

                {sortOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                    <div className="nb-lg absolute right-0 top-full z-50 mt-2 w-64 border-[var(--line-strong)] p-1.5">
                      <p className="eyebrow px-2.5 pb-1.5 pt-1.5 !text-[10px]">
                        {t("catalog.sort")}
                      </p>
                      {SORTS.map(({ key, labelKey, Icon }) => {
                        const on = sort === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              haptic();
                              setSort(key);
                              setSortOpen(false);
                            }}
                            className={`font-display flex w-full items-center gap-2.5 rounded-[var(--r)] px-3 py-2.5 text-left text-[14px] font-semibold ${
                              on ? "bg-[var(--accent-soft)] text-[var(--accent-hi)]" : "text-[var(--ink)] hover:bg-[var(--surface-2)]"
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                            <span className="flex-1">{t(labelKey)}</span>
                            {on && <Check className="h-4 w-4 shrink-0" strokeWidth={2.75} />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {(roots.length > 0 || hasMarkdown) && (
              <DragScroll className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 pb-0.5">
                <Chip active={category === null} onClick={() => selectCategory(null)}>
                  {t("catalog.allTags")}
                </Chip>
                {roots.map((c) => (
                  <Chip key={c.id} active={activeRoot?.id === c.id} onClick={() => selectCategory(c.slug)}>
                    {c.name}
                  </Chip>
                ))}
                {hasMarkdown && (
                  <Chip active={category === MARKDOWN_COLLECTION_SLUG} onClick={() => selectCategory(MARKDOWN_COLLECTION_SLUG)}>
                    {t("catalog.markdown")}
                  </Chip>
                )}
              </DragScroll>
            )}

            {activeRoot && children.length > 0 && (
              <DragScroll className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
                <Chip small active={category === activeRoot.slug} onClick={() => selectCategory(activeRoot.slug)}>
                  {t("catalog.allIn", { name: lowerFirst(activeRoot.name) })}
                </Chip>
                {children.map((c) => (
                  <Chip key={c.id} small active={category === c.slug} onClick={() => selectCategory(c.slug)}>
                    {c.name}
                  </Chip>
                ))}
              </DragScroll>
            )}

            {activeChips.length > 0 && (
              <DragScroll className="no-scrollbar -mx-4 mt-2 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5">
                {activeChips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={t("catalog.filter.remove", { name: c.label })}
                    onClick={() => {
                      haptic();
                      setFilter((f) => c.remove(f));
                    }}
                    className="nb-press inline-flex min-h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] py-1 pl-2.5 pr-1.5 text-[12px] font-semibold text-[var(--accent-hi)]"
                  >
                    {c.label}
                    <X className="h-3.5 w-3.5" strokeWidth={2.75} />
                  </button>
                ))}
                {activeChips.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      setFilter((f) => ({ ...EMPTY_FILTER, category: f.category ?? null }));
                    }}
                    className="min-h-[30px] shrink-0 whitespace-nowrap px-2 text-[12px] font-semibold text-[var(--muted)] underline underline-offset-2"
                  >
                    {t("catalog.filter.resetAll")}
                  </button>
                )}
              </DragScroll>
            )}
          </>
        )}
      </div>

      {/* ── GRID / STATES ──────────────────────────────────────────────── */}
      <div className="pt-5">
        {isLoading && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            icon={<WifiOff className="h-9 w-9" strokeWidth={2.5} />}
            title={t("catalog.error.title")}
            text={t("catalog.error.text")}
          >
            <NbButton onClick={() => refetch()} loading={isRefetching}>{t("common.retry")}</NbButton>
          </EmptyState>
        )}

        {!isLoading && !isError && products.length === 0 && (
          <EmptyState
            icon={<PackageOpen className="h-9 w-9" strokeWidth={2.5} />}
            title={t("catalog.empty.title")}
            text={t("catalog.empty.text")}
          />
        )}

        {!isLoading && !isError && products.length > 0 && sorted.length === 0 && (
          <EmptyState
            icon={<Search className="h-9 w-9" strokeWidth={2.5} />}
            title={t("catalog.noResults.title")}
            text={t("catalog.noResults.text")}
          >
            <NbButton onClick={() => { setSearch(""); setFilter(EMPTY_FILTER); }}>{t("catalog.resetFilters")}</NbButton>
          </EmptyState>
        )}

        {!isLoading && !isError && sorted.length > 0 && (
          // No `key` on the grid: re-keying it per filter used to remount all ~216 cards and replay
          // a 0.05 s stagger over every one of them (~10 s of spring animations, mostly off
          // screen) on each chip tap. On iPhones that kept the main thread busy long enough for the
          // next taps to be lost — prod data showed 4× more repeated chip taps than on Android.
          // Now cards keep their identity across filters and only the first screenful animates in.
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            {sorted.map((p, i) =>
              i < ANIMATED_CARDS ? (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: { ...spring, delay: 0.03 + i * 0.04 } }}
                  className="catalog-cell flex"
                >
                  <ProductCard product={p} onOpen={setSelected} summary={summaries.get(p.id)} />
                </motion.div>
              ) : (
                <div key={p.id} className="catalog-cell flex">
                  <ProductCard product={p} onOpen={setSelected} summary={summaries.get(p.id)} />
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <ProductView
        product={selected}
        onClose={() => setSelected(null)}
        onAdded={() => fireToast(t("catalog.addedToast"))}
        onCategory={(slug) => {
          setSearch("");
          setFilter((f) => filterForCategory(f, slug));
          setSelected(null);
          window.scrollTo({ top: 0 });
        }}
        onBrand={(slug) => {
          setSearch("");
          setFilter({ ...EMPTY_FILTER, brands: [slug] });
          setSelected(null);
          window.scrollTo({ top: 0 });
        }}
      />
      <FilterSheet
        open={filtersOpen}
        schema={schema}
        items={items}
        filter={{ ...filter, category }}
        q={search}
        onApply={(f) => {
          setFilter(f);
          setFiltersOpen(false);
        }}
      />
      <Toast message={toast} />
    </div>
  );
}

/** Horizontal scroller with mouse drag + wheel-to-horizontal (desktop). Touch
 *  keeps native overflow scrolling (drag is mouse-only). */
function DragScroll({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef({ down: false, startX: 0, startLeft: 0, moved: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Wheel → horizontal scroll (desktop).
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    // Drag-scroll via window listeners (NO pointer capture — capture would steal the
    // click from the chips, making tags unselectable). We only start scrolling after
    // a small movement threshold, so a plain click still selects a tag.
    const onMove = (e: PointerEvent) => {
      if (!st.current.down) return;
      const dx = e.clientX - st.current.startX;
      if (Math.abs(dx) > 5) st.current.moved = true;
      if (st.current.moved) el.scrollLeft = st.current.startLeft - dx;
    };
    const onUp = () => {
      if (!st.current.down) return;
      st.current.down = false;
      el.style.cursor = "grab";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      // userSelect:none stops text selection while dragging; touch keeps native scroll.
      style={{ cursor: "grab", userSelect: "none", touchAction: "pan-x" }}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") return; // touch/pen → native overflow scroll + tap
        const el = ref.current!;
        st.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
        el.style.cursor = "grabbing";
      }}
      onClickCapture={(e) => {
        // Swallow the click only if this was a real drag; a plain click reaches the chip.
        if (st.current.moved) {
          e.preventDefault();
          e.stopPropagation();
          st.current.moved = false;
        }
      }}
    >
      {children}
    </div>
  );
}

function Chip({ children, active, onClick, small }: { children: ReactNode; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`nb-chip nb-press shrink-0 whitespace-nowrap ${small ? "min-h-[32px] px-3 py-1 text-[12px]" : "min-h-[38px] px-4 py-1.5 text-[13px]"} ${active ? "nb-chip-active" : ""}`}
    >
      {children}
    </button>
  );
}

function NbButton({ children, onClick, loading }: { children: ReactNode; onClick: () => void; loading?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="nb-accent nb-press tap nb-up px-6 py-3 text-[14px] disabled:opacity-60"
    >
      {loading ? "…" : children}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="nb hud-frame mx-auto mt-10 flex max-w-[340px] flex-col items-center gap-3 px-6 py-10 text-center"
    >
      <span className="grid h-16 w-16 place-items-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]">
        {icon}
      </span>
      <h2 className="nb-up text-[18px] font-extrabold text-[var(--ink)]">{title}</h2>
      <p className="max-w-[260px] text-[13px] text-[var(--muted)]">{text}</p>
      {children}
    </motion.div>
  );
}
