"use client";

/**
 * SHOP catalog — ChiSetup (v3).
 * Data/logic unchanged (queryKey ["products"], search + tag filter, tap →
 * ProductView). Sorting: out-of-stock always sink to the bottom; default orders
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
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ProductCard } from "@/components/catalog/ProductCard";
import { Logo } from "@/components/Logo";
import { ProductCardSkeleton } from "@/components/catalog/ProductCardSkeleton";
import { ProductView } from "@/components/catalog/ProductView";
import { NotificationsBell } from "@/components/NotificationsBell";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Toast } from "@/components/ui/Toast";
import { getActiveTag } from "@shop/shared";
import { useT } from "@/i18n/context";
import { customerApi, type Product, type ProductTag } from "@/lib/api";
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

function inStock(p: Product): boolean {
  return (p.variants?.length ?? 0) > 0
    ? (p.variants ?? []).some((v) => v.stock > 0)
    : (p.stock ?? 0) > 0;
}

export default function CatalogPage() {
  const t = useT();
  const [selected, setSelected] = useState<Product | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("popular");
  const [sortOpen, setSortOpen] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["products"],
    queryFn: () => customerApi.getProducts(),
  });

  const products = useMemo(() => data ?? [], [data]);

  const tags = useMemo<ProductTag[]>(() => {
    const map = new Map<string, ProductTag>();
    for (const p of products) for (const t of p.tags ?? []) if (!map.has(t.id)) map.set(t.id, t);
    return Array.from(map.values());
  }, [products]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) => {
      const matchesSearch = q === "" || p.title.toLowerCase().includes(q);
      const matchesTag = activeTag === null || (p.tags ?? []).some((t) => t.id === activeTag);
      return matchesSearch && matchesTag;
    });
    return list.sort((a, b) => {
      // Out-of-stock always sinks to the bottom.
      const ai = inStock(a) ? 0 : 1;
      const bi = inStock(b) ? 0 : 1;
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
  }, [products, search, activeTag, sort]);

  const showControls = !isLoading && !isError && products.length > 0;
  const fireToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  return (
    <div className="min-h-full" style={{ marginTop: "calc(-1 * max(16px, var(--safe-top)))" }}>
      {/* ── STICKY HEADER ──────────────────────────────────────────────── */}
      <div
        className="sticky z-30 -mx-4 border-b border-[var(--line)] px-4 pb-3 backdrop-blur-[12px]"
        style={{ top: 0, paddingTop: "max(12px, var(--safe-top))", background: "rgba(14,14,16,.86)" }}
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

        {showControls && (
          <>
            <div className="mt-3 flex items-stretch gap-2">
              <div className="flex flex-1 items-center gap-2.5 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
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

            {tags.length > 0 && (
              <DragScroll className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
                <Chip active={activeTag === null} onClick={() => { haptic(); setActiveTag(null); }}>
                  {t("catalog.allTags")}
                </Chip>
                {tags.map((tag) => (
                  <Chip key={tag.id} active={activeTag === tag.id} onClick={() => { haptic(); setActiveTag(tag.id); }}>
                    {tag.name}
                  </Chip>
                ))}
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
            <NbButton onClick={() => { setSearch(""); setActiveTag(null); }}>{t("catalog.resetFilters")}</NbButton>
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
                  <ProductCard product={p} onOpen={setSelected} />
                </motion.div>
              ) : (
                <div key={p.id} className="catalog-cell flex">
                  <ProductCard product={p} onOpen={setSelected} />
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

function Chip({ children, active, onClick }: { children: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`nb-chip nb-press tap shrink-0 whitespace-nowrap px-4 py-2 text-[13px] ${active ? "nb-chip-active" : ""}`}
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
