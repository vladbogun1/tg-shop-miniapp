"use client";

/**
 * SHOP catalog — NEO-BRUTALISM.
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
import { ProductCardSkeleton } from "@/components/catalog/ProductCardSkeleton";
import { ProductView } from "@/components/catalog/ProductView";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Toast } from "@/components/ui/Toast";
import { apiGet, type Product, type ProductTag } from "@/lib/api";
import { staggerContainer, riseItem } from "@/lib/motion";
import { haptic } from "@/lib/telegram";

type SortKey = "popular" | "price_asc" | "price_desc" | "name";

const SORTS: { key: SortKey; label: string; Icon: typeof Flame }[] = [
  { key: "popular", label: "Сначала популярные", Icon: Flame },
  { key: "price_asc", label: "Сначала дешевле", Icon: ArrowUpNarrowWide },
  { key: "price_desc", label: "Сначала дороже", Icon: ArrowDownNarrowWide },
  { key: "name", label: "По названию (А–Я)", Icon: ArrowDownAZ },
];

function inStock(p: Product): boolean {
  return (p.variants?.length ?? 0) > 0
    ? (p.variants ?? []).some((v) => v.stock > 0)
    : (p.stock ?? 0) > 0;
}

export default function CatalogPage() {
  const [selected, setSelected] = useState<Product | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("popular");
  const [sortOpen, setSortOpen] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiGet<Product[]>("/api/products"),
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
          return a.title.localeCompare(b.title, "ru");
        case "popular":
        default:
          return (b.soldCount ?? 0) - (a.soldCount ?? 0) || a.title.localeCompare(b.title, "ru");
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
        className="sticky z-30 -mx-4 border-b-[3px] border-[var(--line)] px-4 pb-3"
        style={{ top: 0, paddingTop: "max(12px, var(--safe-top))", background: "var(--bg)" }}
      >
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[30px] font-black leading-[0.95] tracking-tight text-[var(--ink)]">
              <span className="nb-up inline-block -rotate-1 border-[3px] border-[var(--line)] bg-[var(--accent)] px-2 py-0.5 text-[var(--accent-ink)] shadow-[4px_4px_0_var(--shadow)]">
                MAXSOLCH
              </span>
            </h1>
            <p className="mt-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Выбирай и кидай в корзину
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NotificationsBell />
            <ThemeToggle />
          </div>
        </header>

        {showControls && (
          <>
            <div className="mt-3 flex items-stretch gap-2">
              <div className="nb-flat flex flex-1 items-center gap-2.5 px-3.5 py-3">
                <Search className="h-[18px] w-[18px] shrink-0 text-[var(--ink)]" strokeWidth={2.75} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск товаров"
                  aria-label="Поиск товаров"
                  enterKeyHint="search"
                  className="w-full min-h-0 bg-transparent text-[15px] font-semibold text-[var(--ink)] outline-none placeholder:font-medium placeholder:text-[var(--faint)]"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Очистить поиск"
                    onClick={() => {
                      haptic();
                      setSearch("");
                    }}
                    className="-mr-1 grid h-7 w-7 shrink-0 place-items-center border-[2.5px] border-[var(--line)] bg-[var(--c3)] text-[var(--ink)]"
                  >
                    <X className="h-4 w-4" strokeWidth={3} />
                  </button>
                )}
              </div>

              {/* sort */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  aria-label="Сортировка"
                  onClick={() => {
                    haptic();
                    setSortOpen((o) => !o);
                  }}
                  className={`nb-flat nb-press tap grid h-full w-[52px] place-items-center ${
                    sort !== "popular" ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--ink)]"
                  }`}
                >
                  <ArrowDownUp className="h-5 w-5" strokeWidth={2.75} />
                </button>

                {sortOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                    <div className="nb nb-lg absolute right-0 top-full z-50 mt-2 w-64 p-1.5">
                      <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-black uppercase tracking-wide text-[var(--faint)]">
                        Сортировка
                      </p>
                      {SORTS.map(({ key, label, Icon }) => {
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
                            className={`flex w-full items-center gap-2.5 rounded-[var(--r)] px-3 py-2.5 text-left text-[14px] font-bold ${
                              on ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--ink)] hover:bg-[var(--surface-2)]"
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                            <span className="flex-1">{label}</span>
                            {on && <Check className="h-4 w-4 shrink-0" strokeWidth={3} />}
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
                  Все
                </Chip>
                {tags.map((t) => (
                  <Chip key={t.id} active={activeTag === t.id} onClick={() => { haptic(); setActiveTag(t.id); }}>
                    {t.name}
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
            title="Не удалось загрузить"
            text="Сервер недоступен. Проверьте подключение и попробуйте снова."
          >
            <NbButton onClick={() => refetch()} loading={isRefetching}>Повторить</NbButton>
          </EmptyState>
        )}

        {!isLoading && !isError && products.length === 0 && (
          <EmptyState
            icon={<PackageOpen className="h-9 w-9" strokeWidth={2.5} />}
            title="Пока пусто"
            text="Товаров пока нет. Загляните позже — скоро появятся новинки."
          />
        )}

        {!isLoading && !isError && products.length > 0 && sorted.length === 0 && (
          <EmptyState
            icon={<Search className="h-9 w-9" strokeWidth={2.5} />}
            title="Ничего не найдено"
            text="Попробуйте изменить запрос или выбрать другой тег."
          >
            <NbButton onClick={() => { setSearch(""); setActiveTag(null); }}>Сбросить фильтры</NbButton>
          </EmptyState>
        )}

        {!isLoading && !isError && sorted.length > 0 && (
          <motion.div
            key={`${activeTag ?? "all"}::${search.trim().toLowerCase()}::${sort}`}
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid grid-cols-2 gap-x-4 gap-y-5"
          >
            {sorted.map((p) => (
              <motion.div key={p.id} variants={riseItem} className="flex">
                <ProductCard product={p} onOpen={setSelected} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <ProductView
        product={selected}
        onClose={() => setSelected(null)}
        onAdded={() => fireToast("Добавлено в корзину")}
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
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{ cursor: "grab" }}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") return;
        const el = ref.current!;
        st.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
      onPointerMove={(e) => {
        if (!st.current.down) return;
        const dx = e.clientX - st.current.startX;
        if (Math.abs(dx) > 4) st.current.moved = true;
        ref.current!.scrollLeft = st.current.startLeft - dx;
      }}
      onPointerUp={(e) => {
        st.current.down = false;
        try {
          ref.current!.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
      onClickCapture={(e) => {
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
      className="nb-accent nb-press tap nb-up px-5 py-3 text-[14px] disabled:opacity-60"
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
      className="nb nb-lg mx-auto mt-10 flex max-w-[340px] flex-col items-center gap-3 px-6 py-10 text-center"
    >
      <span className="grid h-16 w-16 place-items-center border-[3px] border-[var(--line)] bg-[var(--c3)] text-[var(--ink)]">
        {icon}
      </span>
      <h2 className="nb-up text-[18px] font-black text-[var(--ink)]">{title}</h2>
      <p className="max-w-[260px] text-[13px] font-medium text-[var(--muted)]">{text}</p>
      {children}
    </motion.div>
  );
}
