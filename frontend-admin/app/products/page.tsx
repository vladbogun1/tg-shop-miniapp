"use client";

/**
 * Products (route "/products").
 *
 *  - search by title, tag filter, status chips with counts
 *    (Все / В наличии / Закончились (видны) / Скрытые),
 *  - smart default sort (active-but-out-of-stock surfaced first) + manual sorts,
 *  - list view (DEFAULT) ⇄ cards view toggle; the whole row opens the editor,
 *  - effective stock = sum of variant stocks else product.stock,
 *  - red highlight + "Закончился" badge for active items with effective stock 0,
 *  - «на витрине» toggle and archive, both with an «Отменить» toast; on phones the row actions
 *    live in a «⋯» menu so the title gets two full lines.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
  MoreHorizontal,
} from "lucide-react";
import { adminApi, ApiError, type Product } from "@/lib/api";
import { money } from "@/lib/money";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";
import { staggerContainer, riseItem } from "@/lib/motion";
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
import { useShopSetting } from "@/lib/settings";

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

  // Deep link "/products?edit=<id>" (from the «Переводы» screen): open that product's editor once
  // the list is loaded, then drop the parameter so a reload does not reopen it.
  useEffect(() => {
    if (isLoading || typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("edit");
    if (!id) return;
    const p = products.find((x) => x.id === id);
    if (p) {
      setEditing(p);
      setModalOpen(true);
    }
    sp.delete("edit");
    const qs = sp.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [isLoading, products]);

  // Both are one tap away from a mis-tap on a phone, so each confirms with an «Отменить» toast.
  async function setActive(p: Product, active: boolean, undo = true) {
    try {
      await adminApi.setProductActive(p.id, active);
      refresh();
      if (undo) {
        push(
          active ? `«${p.title}» снова на витрине` : `«${p.title}» скрыт с витрины`,
          "ok",
          { label: "Отменить", onClick: () => setActive(p, !active, false) }
        );
      }
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    }
  }
  async function setArchived(p: Product, archived: boolean, undo = true) {
    try {
      await adminApi.setProductArchived(p.id, archived);
      push(
        archived ? `«${p.title}» в архиве` : `«${p.title}» восстановлен`,
        "ok",
        undo ? { label: "Отменить", onClick: () => setArchived(p, !archived, false) } : undefined
      );
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

  // Warehouse summary over active (non-archived) products: units + total retail value.
  const stockSummary = useMemo(() => {
    const active = products.filter((p) => p.active !== false);
    let units = 0;
    let valueMinor = 0;
    for (const p of active) {
      const u = effStock(p);
      units += u;
      valueMinor += u * p.priceMinor;
    }
    return {
      count: active.length,
      units,
      valueMinor,
      out: active.filter((p) => effStock(p) === 0).length,
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
              className="h-10 pointer-coarse:h-11"
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

      {/* Warehouse summary */}
      {!archivedView && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Товаров" value={String(stockSummary.count)} />
          <StatTile label="На складе" value={`${stockSummary.units} шт`} />
          <StatTile label="Стоимость склада" value={money(stockSummary.valueMinor)} accent />
          <StatTile label="Закончились" value={String(stockSummary.out)} />
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Input
              label="Поиск по названию"
              
              placeholder="Например, клавиатура…"
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
          {/* Same height as the fields beside it (40 / 44 on touch), segmented-control look. */}
          <div className="flex items-center gap-2">
            <div className="inline-flex h-10 items-center gap-0.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-[3px] pointer-coarse:h-11">
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="Список"
                aria-pressed={view === "list"}
                className={cn(
                  "grid h-full w-9 place-items-center rounded-[var(--r-sm)] border transition-colors pointer-coarse:w-11",
                  view === "list"
                    ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
                )}
              >
                <ListIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView("cards")}
                aria-label="Карточки"
                aria-pressed={view === "cards"}
                className={cn(
                  "grid h-full w-9 place-items-center rounded-[var(--r-sm)] border transition-colors pointer-coarse:w-11",
                  view === "cards"
                    ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {!archivedView && (
          // Four chips with counts are wider than a phone: scroll them, not the page.
          <div className="thin-scroll -mx-1 max-w-full overflow-x-auto px-1 pb-1">
            <SegmentedControl<StatusFilter>
              options={statusOptions}
              value={status}
              onChange={setStatus}
              className="whitespace-nowrap"
            />
          </div>
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
  const lowQty = useShopSetting("catalog.lowStockQty", 3);
  if (p.active !== false && stock === 0) return <Badge tone="danger">Закончился</Badge>;
  if (stock <= lowQty && stock > 0) return <Badge tone="warn">Мало: {stock}</Badge>;
  return (
    <span className="tabular text-[12px] text-[var(--text-muted)]">
      Остаток: {stock}
    </span>
  );
}

/** Price: Exo 2 700 tabular in white, like the shop's price (no filled tag in v3). */
function PriceTag({ p, className }: { p: Product; className?: string }) {
  return (
    <span className={cn("font-display tabular inline-flex items-center text-[14px] font-bold text-[var(--ink)]", className)}>
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
        "nb-press focusable grid h-9 w-9 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors pointer-coarse:h-11 pointer-coarse:w-11",
        danger
          ? "hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)]"
          : "hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
      )}
    >
      {children}
    </button>
  );
}

/** Phone-only «⋯» menu for the row actions (edit / archive). */
function RowMenu({ onEdit, onArchive }: { onEdit: () => void; onArchive: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const item =
    "block w-full rounded-[var(--r-sm)] px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors hover:bg-[var(--surface-hover)]";
  return (
    <div ref={ref} className="relative">
      <IconBtn label="Действия" onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal className="h-4 w-4" />
      </IconBtn>
      {open && (
        <div className="elevated absolute right-0 top-11 z-20 w-44 overflow-hidden p-1 pointer-coarse:top-12">
          <button type="button" className={item} onClick={() => (setOpen(false), onEdit())}>
            Редактировать
          </button>
          <button
            type="button"
            className={cn(item, "text-[var(--danger-ink)]")}
            onClick={() => (setOpen(false), onArchive())}
          >
            В архив
          </button>
        </div>
      )}
    </div>
  );
}

function ProductRow({ p, archivedView, onEdit, onActive, onArchive }: RowProps) {
  const danger = p.active !== false && effStock(p) === 0 && !archivedView;
  return (
    <motion.div
      variants={riseItem}
      role={archivedView ? undefined : "button"}
      tabIndex={archivedView ? undefined : 0}
      onClick={archivedView ? undefined : onEdit}
      onKeyDown={(e) => {
        if (!archivedView && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        "card flex items-center gap-3 p-3 sm:gap-3.5",
        !archivedView && "card-hover cursor-pointer",
        danger && "border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
      )}
    >
      <Image
        src={p.images?.[0]?.url}
        alt={p.title}
        size={120}
        className="h-14 w-14 shrink-0 rounded-[var(--r-md)] border border-[var(--line)]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="line-clamp-2 min-w-0 break-words text-[14px] font-semibold leading-snug text-[var(--text)] sm:line-clamp-1">
            {p.title}
          </h3>
          {!p.active && !archivedView && <Badge tone="warn">скрыт</Badge>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-muted)]">
          <PriceTag p={p} />
          <StockBadge p={p} />
          {p.variants && p.variants.length > 0 && (
            <span className="tabular">{p.variants.length} вар.</span>
          )}
          {(p.soldCount ?? 0) > 0 && (
            <span className="tabular">продано {p.soldCount}</span>
          )}
        </div>
      </div>
      {/* Controls must not also trigger the row's «open editor» click. */}
      <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {!archivedView ? (
          <>
            <div className="flex flex-col items-center gap-0.5" title="Показывать на сайте и в Mini App">
              <Toggle checked={!!p.active} onChange={onActive} />
              <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">
                на витрине
              </span>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <IconBtn label="Редактировать" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
              </IconBtn>
              <IconBtn label="В архив" onClick={() => onArchive(true)} danger>
                <Archive className="h-4 w-4" />
              </IconBtn>
            </div>
            <div className="sm:hidden">
              <RowMenu onEdit={onEdit} onArchive={() => onArchive(true)} />
            </div>
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
      className={cn(
        "card card-hover flex flex-col overflow-hidden p-0",
        danger && "border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
      )}
    >
      <div className="relative border-b border-[var(--line)]">
        <Image src={p.images?.[0]?.url} alt={p.title} size={400} className="aspect-square w-full" />
        {!p.active && !archivedView && (
          <div className="absolute left-2 top-2">
            <Badge tone="warn">скрыт</Badge>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--text)]">
          {p.title}
        </h3>
        <div className="mt-2">
          <PriceTag p={p} className="text-[15px]" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StockBadge p={p} />
          {p.variants && p.variants.length > 0 ? (
            <span className="tabular text-[12px] text-[var(--text-muted)]">
              {p.variants.length} вар.
            </span>
          ) : null}
          {(p.soldCount ?? 0) > 0 && (
            <span className="tabular text-[12px] text-[var(--text-muted)]">
              продано {p.soldCount}
            </span>
          )}
        </div>
        <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3.5">
          {!archivedView ? (
            <>
              <Toggle checked={!!p.active} onChange={onActive} label="на витрине" />
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

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card flex flex-col gap-2 p-3.5">
      <span className="field-label !text-[11px]">{label}</span>
      <span className={cn("kpi-num truncate text-[20px]", accent && "!text-[var(--accent-hi)]")}>
        {value}
      </span>
    </div>
  );
}
