"use client";

/**
 * Products (route "/products") — Neo-Brutalism restyle.
 *
 * Preserves 100% of the original functionality:
 *  - search by title, tag filter, status SegmentedControl chips with counts
 *    (Все / В наличии / Закончились (видны) / Скрытые),
 *  - smart default sort (active-but-out-of-stock surfaced first) + manual sorts,
 *  - list view (DEFAULT) ⇄ cards view toggle,
 *  - effective stock = sum of variant stocks else product.stock,
 *  - red highlight + "Закончился" badge for active items with effective stock 0,
 *  - active/archive toggles, archived view toggle, create/edit modal.
 * Only the visuals change. Same query keys (["products", archivedView], ["tags"]).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Plus,
  Archive,
  ArchiveRestore,
  Pencil,
  List as ListIcon,
  LayoutGrid,
  Search,
  PackageSearch,
} from "lucide-react";
import { adminApi, ApiError, type Product } from "@/lib/api";
import { money } from "@/lib/money";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";
import { staggerContainer, riseItem, hoverLift } from "@/lib/motion";
import { useToast } from "@/lib/toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductModal } from "@/components/products/ProductModal";

type StatusFilter = "all" | "instock" | "out" | "hidden";
type SortKey =
  | "smart"
  | "title"
  | "price_desc"
  | "price_asc"
  | "stock_asc"
  | "stock_desc"
  | "sold";
type ViewMode = "list" | "cards";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "smart", label: "Умная (требуют внимания)" },
  { value: "title", label: "Название А–Я" },
  { value: "price_desc", label: "Цена ↓" },
  { value: "price_asc", label: "Цена ↑" },
  { value: "stock_asc", label: "Остаток ↑" },
  { value: "stock_desc", label: "Остаток ↓" },
  { value: "sold", label: "Продажи ↓" },
];

function effStock(p: Product): number {
  if (p.variants && p.variants.length > 0) {
    return p.variants.reduce((s, v) => s + (v.stock ?? 0), 0);
  }
  return p.stock ?? 0;
}

/** smart group: visible-but-out-of-stock (0) → in-stock active (1) → hidden (2). */
function smartGroup(p: Product): number {
  if (p.active === false) return 2;
  return effStock(p) === 0 ? 0 : 1;
}

export default function ProductsPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [archivedView, setArchivedView] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [tagId, setTagId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("smart");
  const [view, setView] = useState<ViewMode>("list");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", archivedView],
    queryFn: () => (archivedView ? adminApi.productsArchived() : adminApi.products()),
  });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: () => adminApi.tags() });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function setActive(p: Product, active: boolean) {
    try {
      await adminApi.setProductActive(p.id, active);
      refresh();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    }
  }
  async function setArchived(p: Product, archived: boolean) {
    try {
      await adminApi.setProductArchived(p.id, archived);
      push(archived ? "В архиве" : "Восстановлен", "ok");
      refresh();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products.filter((p) => {
      if (q && !p.title.toLowerCase().includes(q)) return false;
      if (tagId && !(p.tags ?? []).some((t) => t.id === tagId)) return false;
      if (!archivedView) {
        if (status === "instock" && !(p.active !== false && effStock(p) > 0)) return false;
        if (status === "out" && !(p.active !== false && effStock(p) === 0)) return false;
        if (status === "hidden" && p.active !== false) return false;
      }
      return true;
    });
    const byTitle = (a: Product, b: Product) => a.title.localeCompare(b.title, "ru");
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "title":
          return byTitle(a, b);
        case "price_desc":
          return b.priceMinor - a.priceMinor;
        case "price_asc":
          return a.priceMinor - b.priceMinor;
        case "stock_asc":
          return effStock(a) - effStock(b) || byTitle(a, b);
        case "stock_desc":
          return effStock(b) - effStock(a) || byTitle(a, b);
        case "sold":
          return (b.soldCount ?? 0) - (a.soldCount ?? 0) || byTitle(a, b);
        default: // smart
          return (
            smartGroup(a) - smartGroup(b) ||
            effStock(a) - effStock(b) ||
            (b.soldCount ?? 0) - (a.soldCount ?? 0) ||
            byTitle(a, b)
          );
      }
    });
    return list;
  }, [products, search, status, tagId, sort, archivedView]);

  const counts = useMemo(() => {
    const active = products.filter((p) => p.active !== false);
    return {
      all: products.length,
      instock: active.filter((p) => effStock(p) > 0).length,
      out: active.filter((p) => effStock(p) === 0).length,
      hidden: products.filter((p) => p.active === false).length,
    };
  }, [products]);

  const statusOptions = useMemo(
    () => [
      { value: "all" as StatusFilter, label: "Все", count: counts.all },
      { value: "instock" as StatusFilter, label: "В наличии", count: counts.instock },
      { value: "out" as StatusFilter, label: "Закончились", count: counts.out },
      { value: "hidden" as StatusFilter, label: "Скрытые", count: counts.hidden },
    ],
    [counts]
  );

  const tagOptions = useMemo(
    () => [{ value: "", label: "Все теги" }, ...tags.map((t) => ({ value: t.id, label: t.name }))],
    [tags]
  );

  return (
    <div>
      <PageHeader
        title="Товары"
        subtitle="Каталог, остатки и видимость"
        actions={
          <>
            <SegmentedControl<"active" | "archived">
              options={[
                { value: "active", label: "Активные" },
                { value: "archived", label: "Архив" },
              ]}
              value={archivedView ? "archived" : "active"}
              onChange={(v) => setArchivedView(v === "archived")}
            />
            <Button
              variant="accent"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              Новый товар
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Input
              label="Поиск по названию"
              placeholder="Например, кроссовки…"
              icon={<Search className="h-4 w-4" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-w-[170px]">
            <Select
              label="Тег"
              value={tagId ?? ""}
              onChange={(v) => setTagId(v || null)}
              placeholder="Все теги"
              options={tagOptions}
            />
          </div>
          <div className="min-w-[210px]">
            <Select<SortKey>
              label="Сортировка"
              value={sort}
              onChange={(v) => setSort(v)}
              options={SORT_OPTIONS}
            />
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <div className="inline-flex items-center gap-1 rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface-2)] p-1 shadow-[4px_4px_0_var(--shadow)]">
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="Список"
                className={cn(
                  "grid h-8 w-9 place-items-center rounded-[var(--r-sm)] transition-colors",
                  view === "list"
                    ? "border-2 border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                )}
              >
                <ListIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView("cards")}
                aria-label="Карточки"
                className={cn(
                  "grid h-8 w-9 place-items-center rounded-[var(--r-sm)] transition-colors",
                  view === "cards"
                    ? "border-2 border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {!archivedView && (
          <SegmentedControl<StatusFilter>
            options={statusOptions}
            value={status}
            onChange={setStatus}
          />
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[80px] rounded-[var(--r-md)]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={
            products.length === 0
              ? archivedView
                ? "Архив пуст"
                : "Товаров пока нет"
              : "Ничего не найдено"
          }
          description={
            products.length === 0
              ? archivedView
                ? "Архивированные товары появятся здесь."
                : "Создайте первый товар, чтобы начать."
              : "Попробуйте изменить поиск или фильтры."
          }
          action={
            products.length === 0 && !archivedView ? (
              <Button
                variant="accent"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                Новый товар
              </Button>
            ) : undefined
          }
        />
      ) : view === "list" ? (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="flex flex-col gap-3"
        >
          {visible.map((p) => (
            <ProductRow
              key={p.id}
              p={p}
              archivedView={archivedView}
              onEdit={() => {
                setEditing(p);
                setModalOpen(true);
              }}
              onActive={(v) => setActive(p, v)}
              onArchive={(a) => setArchived(p, a)}
            />
          ))}
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              p={p}
              archivedView={archivedView}
              onEdit={() => {
                setEditing(p);
                setModalOpen(true);
              }}
              onActive={(v) => setActive(p, v)}
              onArchive={(a) => setArchived(p, a)}
            />
          ))}
        </motion.div>
      )}

      <ProductModal
        open={modalOpen}
        product={editing}
        tags={tags}
        onClose={() => setModalOpen(false)}
        onSaved={refresh}
      />
    </div>
  );
}

interface RowProps {
  p: Product;
  archivedView: boolean;
  onEdit: () => void;
  onActive: (v: boolean) => void;
  onArchive: (a: boolean) => void;
}

function StockBadge({ p }: { p: Product }) {
  const stock = effStock(p);
  if (p.active !== false && stock === 0) return <Badge tone="danger">Закончился</Badge>;
  if (stock <= 3 && stock > 0) return <Badge tone="warn">Мало: {stock}</Badge>;
  return (
    <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
      Остаток: {stock}
    </span>
  );
}

/** Yellow neo price tag — dark text forced globally on --c3 fills. */
function PriceTag({ p, className }: { p: Product; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[13px] font-extrabold text-[var(--accent-ink)]",
        className
      )}
    >
      {money(p.priceMinor, p.currency)}
    </span>
  );
}

function IconBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "nb-press grid h-9 w-9 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] shadow-[3px_3px_0_var(--shadow)] transition-colors",
        danger ? "hover:bg-[var(--danger)] hover:text-[var(--accent-ink)]" : "hover:bg-[var(--surface-hover)]"
      )}
    >
      {children}
    </button>
  );
}

function ProductRow({ p, archivedView, onEdit, onActive, onArchive }: RowProps) {
  const danger = p.active !== false && effStock(p) === 0 && !archivedView;
  return (
    <motion.div
      variants={riseItem}
      {...hoverLift}
      className={cn(
        "card flex items-center gap-3.5 p-3",
        danger && "border-[var(--danger)]"
      )}
    >
      <Image
        src={p.images?.[0]?.url}
        alt={p.title}
        size={120}
        className="h-14 w-14 shrink-0 rounded-[var(--r-sm)] border-2 border-[var(--line)]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[14px] font-extrabold uppercase tracking-wide text-[var(--text)]">
            {p.title}
          </h3>
          {!p.active && !archivedView && <Badge tone="warn">скрыт</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-muted)]">
          <PriceTag p={p} />
          <StockBadge p={p} />
          {p.variants && p.variants.length > 0 && (
            <span className="font-bold uppercase tracking-wide">{p.variants.length} вар.</span>
          )}
          {(p.soldCount ?? 0) > 0 && (
            <span className="font-bold uppercase tracking-wide">продано {p.soldCount}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!archivedView ? (
          <>
            <Toggle checked={!!p.active} onChange={onActive} />
            <IconBtn label="Редактировать" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </IconBtn>
            <IconBtn label="В архив" onClick={() => onArchive(true)} danger>
              <Archive className="h-4 w-4" />
            </IconBtn>
          </>
        ) : (
          <Button
            size="sm"
            variant="surface"
            icon={<ArchiveRestore className="h-4 w-4" />}
            onClick={() => onArchive(false)}
          >
            Восстановить
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function ProductCard({ p, archivedView, onEdit, onActive, onArchive }: RowProps) {
  const danger = p.active !== false && effStock(p) === 0 && !archivedView;
  return (
    <motion.div
      variants={riseItem}
      {...hoverLift}
      className={cn(
        "card flex flex-col overflow-hidden p-0",
        danger && "border-[var(--danger)]"
      )}
    >
      <div className="relative border-b-[3px] border-[var(--line)]">
        <Image src={p.images?.[0]?.url} alt={p.title} size={400} className="aspect-square w-full" />
        {!p.active && !archivedView && (
          <div className="absolute left-2 top-2">
            <Badge tone="warn">скрыт</Badge>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="line-clamp-2 text-[14px] font-extrabold uppercase tracking-wide text-[var(--text)]">
          {p.title}
        </h3>
        <div className="mt-2">
          <PriceTag p={p} className="text-[15px]" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StockBadge p={p} />
          {p.variants && p.variants.length > 0 ? (
            <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              {p.variants.length} вар.
            </span>
          ) : null}
          {(p.soldCount ?? 0) > 0 && (
            <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              продано {p.soldCount}
            </span>
          )}
        </div>
        <div className="mt-3.5 flex items-center justify-between gap-2 border-t-2 border-[var(--line)] pt-3.5">
          {!archivedView ? (
            <>
              <Toggle checked={!!p.active} onChange={onActive} />
              <div className="flex gap-2">
                <IconBtn label="Редактировать" onClick={onEdit}>
                  <Pencil className="h-4 w-4" />
                </IconBtn>
                <IconBtn label="В архив" onClick={() => onArchive(true)} danger>
                  <Archive className="h-4 w-4" />
                </IconBtn>
              </div>
            </>
          ) : (
            <Button
              size="sm"
              variant="surface"
              className="w-full"
              icon={<ArchiveRestore className="h-4 w-4" />}
              onClick={() => onArchive(false)}
            >
              Восстановить
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
