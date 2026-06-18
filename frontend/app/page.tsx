"use client";

/**
 * SHOP catalog (design doc §8bis.1, roadmap §13.3).
 *
 * Fetches GET /api/products via TanStack Query, renders a mobile-first 2-col
 * grid of liquid-glass product cards. Loading skeletons (shimmer) + friendly
 * empty/error states.
 *
 * Rework:
 *  - Glass search input pinned at the top (filters by title, case-insensitive).
 *  - Horizontally-scrollable row of tag filter chips ("Все" + one per tag,
 *    deduped by id, derived from the loaded products). Combined with search (AND).
 *  - Tap a card → FULLSCREEN ProductView (replaces the bottom-sheet ProductSheet).
 */
import { useQuery } from "@tanstack/react-query";
import { PackageOpen, Search, WifiOff } from "lucide-react";
import { useMemo, useState } from "react";
import { ProductCard } from "@/components/catalog/ProductCard";
import { ProductCardSkeleton } from "@/components/catalog/ProductCardSkeleton";
import { ProductView } from "@/components/catalog/ProductView";
import { NotificationsBell } from "@/components/NotificationsBell";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassChip } from "@/components/ui/GlassChip";
import { Toast } from "@/components/ui/Toast";
import { apiGet, type Product, type ProductTag } from "@/lib/api";

export default function CatalogPage() {
  const [selected, setSelected] = useState<Product | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null); // null = "Все"

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiGet<Product[]>("/api/products"),
  });

  const products = useMemo(() => data ?? [], [data]);

  // Derive the unique tag list (dedupe by id) from the loaded products.
  const tags = useMemo<ProductTag[]>(() => {
    const map = new Map<string, ProductTag>();
    for (const p of products) {
      for (const t of p.tags ?? []) {
        if (!map.has(t.id)) map.set(t.id, t);
      }
    }
    return Array.from(map.values());
  }, [products]);

  // Apply search (title, case-insensitive) AND the selected tag.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch = q === "" || p.title.toLowerCase().includes(q);
      const matchesTag =
        activeTag === null || (p.tags ?? []).some((t) => t.id === activeTag);
      return matchesSearch && matchesTag;
    });
  }, [products, search, activeTag]);

  const fireToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  return (
    <div>
      <header className="mb-3 flex items-start justify-between gap-3 pt-2">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold tracking-tight text-[var(--text)]">
            Магазин
          </h1>
          <p className="text-[13px] text-[var(--text-muted)]">
            Выбирайте товары и добавляйте в корзину
          </p>
        </div>
        <NotificationsBell />
      </header>

      {/* search + tag filters (hidden until we have something to filter) */}
      {!isLoading && !isError && products.length > 0 && (
        <div className="mb-4 pb-1">
          <div className="glass flex items-center gap-2 rounded-[var(--r-pill)] px-4 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск товаров"
              aria-label="Поиск товаров"
              className="tap w-full min-h-0 bg-transparent text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
            />
          </div>

          {tags.length > 0 && (
            <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <GlassChip active={activeTag === null} onClick={() => setActiveTag(null)}>
                Все
              </GlassChip>
              {tags.map((t) => (
                <GlassChip
                  key={t.id}
                  active={activeTag === t.id}
                  onClick={() => setActiveTag(t.id)}
                >
                  {t.name}
                </GlassChip>
              ))}
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          icon={<WifiOff className="h-8 w-8" />}
          title="Не удалось загрузить"
          text="Сервер недоступен. Проверьте подключение и попробуйте снова."
        >
          <GlassButton
            variant="accent"
            loading={isRefetching}
            onClick={() => refetch()}
          >
            Повторить
          </GlassButton>
        </EmptyState>
      )}

      {!isLoading && !isError && products.length === 0 && (
        <EmptyState
          icon={<PackageOpen className="h-8 w-8" />}
          title="Пока пусто"
          text="Товаров пока нет. Загляните позже — скоро здесь появятся новинки."
        />
      )}

      {!isLoading && !isError && products.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="Ничего не найдено"
          text="Попробуйте изменить запрос или выбрать другой тег."
        >
          <GlassButton
            variant="glass"
            onClick={() => {
              setSearch("");
              setActiveTag(null);
            }}
          >
            Сбросить фильтры
          </GlassButton>
        </EmptyState>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} onOpen={setSelected} />
          ))}
        </div>
      )}

      <ProductView
        product={selected}
        onClose={() => setSelected(null)}
        onAdded={() => fireToast("Добавлено в корзину")}
      />
      <Toast message={toast} />
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="glass mt-10 flex flex-col items-center gap-3 rounded-[var(--r-lg)] px-6 py-12 text-center">
      <span className="text-[var(--text-muted)]">{icon}</span>
      <h2 className="text-[17px] font-semibold text-[var(--text)]">{title}</h2>
      <p className="max-w-[260px] text-[13px] text-[var(--text-muted)]">{text}</p>
      {children}
    </div>
  );
}
