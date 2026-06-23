"use client";

/**
 * Products (route "/products") — list/grid of products (GET /api/admin/products)
 * with search, status filters (in-stock / out-of-stock-but-visible / hidden),
 * tag filter, sorting (smart default surfaces visible-but-out-of-stock first),
 * and a list⇄cards view toggle (list is the default — easier to scan).
 * Create/edit modal, active/archive toggles. Delete = archive (docs/SPEC.md).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Archive,
  ArchiveRestore,
  Pencil,
  List as ListIcon,
  LayoutGrid,
  Search,
} from "lucide-react";
import { adminApi, ApiError, type Product } from "@/lib/api";
import { money } from "@/lib/money";
import { Image } from "@/lib/image";
import { GlassChip } from "@/components/ui/GlassChip";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassToggle } from "@/components/ui/GlassToggle";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProductModal } from "@/components/products/ProductModal";
import { useToast } from "@/lib/toast";

type StatusFilter = "all" | "instock" | "out" | "hidden";
type SortKey = "smart" | "title" | "price_desc" | "price_asc" | "stock_asc" | "stock_desc" | "sold";
type ViewMode = "list" | "cards";

const STATUS_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "instock", label: "В наличии" },
  { key: "out", label: "Закончились" },
  { key: "hidden", label: "Скрытые" },
];

const SORT_OPTIONS = [
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
      out: active.filter((p) => effStock(p) === 0).length,
      hidden: products.filter((p) => p.active === false).length,
    };
  }, [products]);

  return (
    <div>
      {/* Top bar: view tabs + add */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <GlassChip active={!archivedView} onClick={() => setArchivedView(false)}>
            Активные
          </GlassChip>
          <GlassChip active={archivedView} onClick={() => setArchivedView(true)}>
            Архив
          </GlassChip>
        </div>
        <div className="flex items-center gap-2">
          <div className="glass flex items-center gap-0.5 rounded-[var(--r-pill)] p-0.5">
            <button
              onClick={() => setView("list")}
              aria-label="Список"
              className={`grid h-8 w-9 place-items-center rounded-[var(--r-pill)] ${
                view === "list" ? "glossy" : "text-[var(--text-muted)]"
              }`}
            >
              <ListIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("cards")}
              aria-label="Карточки"
              className={`grid h-8 w-9 place-items-center rounded-[var(--r-pill)] ${
                view === "cards" ? "glossy" : "text-[var(--text-muted)]"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <GlassButton
            variant="accent"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            Новый товар
          </GlassButton>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <GlassInput
              label="Поиск по названию"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="min-w-[160px]">
            <GlassSelect
              label="Тег"
              value={tagId}
              onChange={(v) => setTagId(v || null)}
              placeholder="Все теги"
              options={[{ value: "", label: "Все теги" }, ...tags.map((t) => ({ value: t.id, label: t.name }))]}
            />
          </div>
          <div className="min-w-[200px]">
            <GlassSelect
              label="Сортировка"
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              options={SORT_OPTIONS}
            />
          </div>
        </div>
        {!archivedView && (
          <div className="flex flex-wrap gap-2">
            {STATUS_CHIPS.map((c) => (
              <GlassChip key={c.key} active={status === c.key} onClick={() => setStatus(c.key)}>
                {c.label}
                {c.key === "out" && counts.out > 0 ? ` · ${counts.out}` : ""}
                {c.key === "hidden" && counts.hidden > 0 ? ` · ${counts.hidden}` : ""}
              </GlassChip>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-[var(--r-md)]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-[var(--r-lg)] px-4 py-16 text-center text-[var(--text-faint)]">
          {products.length === 0
            ? archivedView
              ? "Архив пуст"
              : "Товаров пока нет"
            : "Ничего не найдено по фильтрам"}
        </div>
      ) : view === "list" ? (
        <div className="flex flex-col gap-2">
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
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
        </div>
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
  if (p.active !== false && stock === 0) return <Badge color="var(--danger)">Закончился</Badge>;
  if (stock <= 3 && stock > 0) return <Badge color="var(--warn)">Мало: {stock}</Badge>;
  return <span className="text-[12px] text-[var(--text-muted)]">Остаток: {stock}</span>;
}

function ProductRow({ p, archivedView, onEdit, onActive, onArchive }: RowProps) {
  const danger = p.active !== false && effStock(p) === 0 && !archivedView;
  return (
    <div
      className={`glass flex items-center gap-3 rounded-[var(--r-md)] p-2.5 ${
        danger ? "[box-shadow:inset_3px_0_0_var(--danger)]" : ""
      }`}
    >
      <Image src={p.images?.[0]?.url} alt={p.title} size={120} className="h-14 w-14 shrink-0 rounded-[var(--r-sm)]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[14px] font-semibold text-[var(--text)]">{p.title}</h3>
          {!p.active && !archivedView && <Badge color="var(--warn)">скрыт</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[var(--text-muted)]">
          <span className="font-bold text-[var(--text)]">{money(p.priceMinor, p.currency)}</span>
          <StockBadge p={p} />
          {p.variants && p.variants.length > 0 && <span>{p.variants.length} вар.</span>}
          {(p.soldCount ?? 0) > 0 && <span>продано {p.soldCount}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {!archivedView ? (
          <>
            <GlassToggle checked={!!p.active} onChange={onActive} />
            <button
              onClick={onEdit}
              className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text)]"
              aria-label="Редактировать"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => onArchive(true)}
              className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--danger)]"
              aria-label="В архив"
            >
              <Archive className="h-4 w-4" />
            </button>
          </>
        ) : (
          <GlassButton
            size="sm"
            variant="glass"
            icon={<ArchiveRestore className="h-4 w-4" />}
            onClick={() => onArchive(false)}
          >
            Восстановить
          </GlassButton>
        )}
      </div>
    </div>
  );
}

function ProductCard({ p, archivedView, onEdit, onActive, onArchive }: RowProps) {
  const danger = p.active !== false && effStock(p) === 0 && !archivedView;
  return (
    <div
      className={`glass flex flex-col overflow-hidden rounded-[var(--r-lg)] ${
        danger ? "[box-shadow:inset_0_0_0_1.5px_var(--danger)]" : ""
      }`}
    >
      <Image src={p.images?.[0]?.url} alt={p.title} size={400} className="aspect-square w-full" />
      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-[14px] font-semibold text-[var(--text)]">{p.title}</h3>
          {!p.active && !archivedView && <Badge color="var(--warn)">скрыт</Badge>}
        </div>
        <div className="mt-1 text-[15px] font-bold text-[var(--text)]">
          {money(p.priceMinor, p.currency)}
        </div>
        <div className="mt-1">
          <StockBadge p={p} />
          {p.variants && p.variants.length > 0 ? (
            <span className="ml-2 text-[12px] text-[var(--text-muted)]">{p.variants.length} вар.</span>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
          {!archivedView ? (
            <>
              <GlassToggle checked={!!p.active} onChange={onActive} />
              <div className="flex gap-1">
                <button
                  onClick={onEdit}
                  className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text)]"
                  aria-label="Редактировать"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onArchive(true)}
                  className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--danger)]"
                  aria-label="В архив"
                >
                  <Archive className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <GlassButton
              size="sm"
              variant="glass"
              fullWidth
              icon={<ArchiveRestore className="h-4 w-4" />}
              onClick={() => onArchive(false)}
            >
              Восстановить
            </GlassButton>
          )}
        </div>
      </div>
    </div>
  );
}
