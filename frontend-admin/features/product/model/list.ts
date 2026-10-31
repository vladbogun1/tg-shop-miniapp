import type { CardStatus, ProductCondition } from "@shop/core/catalog";
import { effStock, isUnfinished, smartGroup } from "./stock";
import type { AdminProduct } from "./types";

export type StatusFilter = "all" | "instock" | "out" | "hidden" | "unfinished" | "preorder";
export type CardFilter = "" | CardStatus | "INCOMPLETE";
export type SortKey = "smart" | "title" | "price_desc" | "price_asc" | "stock_asc" | "stock_desc" | "sold" | "demand";
export type ViewMode = "list" | "cards";

export const NO_CATEGORY = "__none";
export const NO_BRAND = "__none";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "smart", label: "Умная (требуют внимания)" },
  { value: "title", label: "Название А–Я" },
  { value: "price_desc", label: "Цена ↓" },
  { value: "price_asc", label: "Цена ↑" },
  { value: "stock_asc", label: "Остаток ↑" },
  { value: "stock_desc", label: "Остаток ↓" },
  { value: "sold", label: "Продажи ↓" },
  { value: "demand", label: "По спросу" },
];

export interface ListFilter {
  search: string;
  status: StatusFilter;
  /** Все id поддерева выбранной категории, "none" — «Без категории», null — без фильтра. */
  categoryScope: Set<string> | "none" | null;
  brandId: string;
  condition: "" | ProductCondition;
  cardFilter: CardFilter;
  archivedView: boolean;
  /** Незаполненных обязательных характеристик по товару. */
  missingOf: ReadonlyMap<string, number>;
  /** Людей, ждущих товар (предзаказ). */
  waitingOf: ReadonlyMap<string, number>;
}

const matchesSearch = (p: AdminProduct, q: string): boolean =>
  !q || p.title.toLowerCase().includes(q) || (p.brandRef?.name ?? "").toLowerCase().includes(q);

function matchesCategory(p: AdminProduct, scope: ListFilter["categoryScope"]): boolean {
  if (scope === "none") return !p.categoryId;
  if (scope instanceof Set) return !!p.categoryId && scope.has(p.categoryId);
  return true;
}

const matchesBrand = (p: AdminProduct, brandId: string): boolean =>
  brandId === NO_BRAND ? !p.brandRef : !brandId || p.brandRef?.id === brandId;

function matchesCard(p: AdminProduct, f: ListFilter): boolean {
  if (f.cardFilter === "INCOMPLETE") return !!(f.missingOf.get(p.id) ?? 0);
  return !f.cardFilter || (p.cardStatus ?? "DRAFT") === f.cardFilter;
}

function matchesBasics(p: AdminProduct, f: ListFilter, q: string): boolean {
  return (
    matchesSearch(p, q) &&
    matchesCategory(p, f.categoryScope) &&
    matchesBrand(p, f.brandId) &&
    (!f.condition || (p.condition ?? "NEW") === f.condition) &&
    matchesCard(p, f)
  );
}

function matchesStatus(p: AdminProduct, f: ListFilter): boolean {
  if (f.archivedView) return true;
  switch (f.status) {
    case "instock":
      return p.active !== false && effStock(p) > 0;
    case "out":
      return p.active !== false && effStock(p) === 0;
    case "hidden":
      return p.active === false;
    case "unfinished":
      return isUnfinished(p);
    case "preorder":
      return (f.waitingOf.get(p.id) ?? 0) > 0;
    default:
      return true;
  }
}

export function filterProducts(products: AdminProduct[], f: ListFilter): AdminProduct[] {
  const q = f.search.trim().toLowerCase();
  return products.filter((p) => matchesBasics(p, f, q) && matchesStatus(p, f));
}

const byTitle = (a: AdminProduct, b: AdminProduct) => a.title.localeCompare(b.title, "ru");
const sold = (p: AdminProduct) => p.soldCount ?? 0;

type Cmp = (a: AdminProduct, b: AdminProduct, waitingOf: ReadonlyMap<string, number>) => number;

const COMPARATORS: Record<Exclude<SortKey, "smart">, Cmp> = {
  title: byTitle,
  price_desc: (a, b) => b.priceMinor - a.priceMinor,
  price_asc: (a, b) => a.priceMinor - b.priceMinor,
  stock_asc: (a, b) => effStock(a) - effStock(b) || byTitle(a, b),
  stock_desc: (a, b) => effStock(b) - effStock(a) || byTitle(a, b),
  sold: (a, b) => sold(b) - sold(a) || byTitle(a, b),
  demand: (a, b, w) => (w.get(b.id) ?? 0) - (w.get(a.id) ?? 0) || sold(b) - sold(a) || byTitle(a, b),
};

const smartCmp: Cmp = (a, b) => smartGroup(a) - smartGroup(b) || effStock(a) - effStock(b) || sold(b) - sold(a) || byTitle(a, b);

export function sortProducts(list: AdminProduct[], sort: SortKey, waitingOf: ReadonlyMap<string, number>): AdminProduct[] {
  const cmp: Cmp = sort === "smart" ? smartCmp : COMPARATORS[sort] ?? smartCmp;
  return [...list].sort((a, b) => cmp(a, b, waitingOf));
}

export interface StatusCounts {
  all: number;
  instock: number;
  out: number;
  hidden: number;
  unfinished: number;
  preorder: number;
}

export function countByStatus(products: AdminProduct[], waitingOf: ReadonlyMap<string, number>): StatusCounts {
  const active = products.filter((p) => p.active !== false);
  return {
    all: products.length,
    instock: active.filter((p) => effStock(p) > 0).length,
    out: active.filter((p) => effStock(p) === 0).length,
    hidden: products.filter((p) => p.active === false).length,
    unfinished: products.filter(isUnfinished).length,
    preorder: active.filter((p) => (waitingOf.get(p.id) ?? 0) > 0).length,
  };
}

export interface StatusOption {
  value: StatusFilter;
  label: string;
  count: number;
}

/** Чипы статусов: «Незавершённые» и «Предзаказ» видны, только когда есть что показать (или выбраны). */
export function statusOptions(counts: StatusCounts, status: StatusFilter): StatusOption[] {
  return [
    { value: "all", label: "Все", count: counts.all },
    { value: "instock", label: "В наличии", count: counts.instock },
    { value: "out", label: "Закончились", count: counts.out },
    { value: "hidden", label: "Скрытые", count: counts.hidden },
    ...(counts.unfinished > 0 || status === "unfinished" ? [{ value: "unfinished" as const, label: "Незавершённые", count: counts.unfinished }] : []),
    ...(counts.preorder > 0 || status === "preorder" ? [{ value: "preorder" as const, label: "Предзаказ", count: counts.preorder }] : []),
  ];
}

export interface StockSummary {
  count: number;
  units: number;
  valueMinor: number;
  out: number;
}

/** Склад по активным (не архивным) товарам: штуки и розничная стоимость. */
export function summarizeStock(products: AdminProduct[]): StockSummary {
  const active = products.filter((p) => p.active !== false);
  let units = 0;
  let valueMinor = 0;
  for (const p of active) {
    const u = effStock(p);
    units += u;
    valueMinor += u * p.priceMinor;
  }
  return { count: active.length, units, valueMinor, out: active.filter((p) => effStock(p) === 0).length };
}
