/**
 * Экран проверки черновика: что в строках и товарах ещё не решено и как это показать. Чистая логика (без React):
 * основная сессия может перенести её в `model/drafts/`. Блокирует «Принять» по-прежнему `draftProblems` — здесь
 * те же проблемы, но со ссылкой на место на экране (`anchor`) и сгруппированные по смыслу.
 */
import { formatNumber } from "@shop/core/money";
import type { CatalogItem, ReviewRow } from "../../model/ai/types";
import type { DraftProduct } from "../../model/drafts/draft";

export interface ReviewCtx {
  byId: Map<string, CatalogItem>;
  /** Товар каталога по названию (нижний регистр) — «такой уже есть». */
  byTitle: Map<string, CatalogItem>;
  leafIds: Set<string>;
}

export function reviewCtx(catalog: CatalogItem[], leafIds: Set<string>): ReviewCtx {
  return { byId: new Map(catalog.map((p) => [p.id, p])), byTitle: new Map(catalog.map((p) => [p.title.trim().toLowerCase(), p])), leafIds };
}

/** Что не так со строкой самой по себе (не с её новым товаром); null — решена. */
export function rowIssue(r: ReviewRow, ctx: ReviewCtx): string | null {
  const d = r.decision;
  if (d.kind === "open") return "Нужно решить, что это за товар";
  if (d.kind === "match") {
    const p = ctx.byId.get(d.productId);
    return p && p.variants.length > 0 && !d.variantId ? "Выберите вариант" : null;
  }
  // Строка нового товара без варианта — не проблема: вариант подставляет `lineVariants` (чем строка отличается).
  return null;
}

export interface ProductIssues {
  category: boolean;
  price: boolean;
  taken: CatalogItem | null;
}

export function productIssues(p: DraftProduct, ctx: ReviewCtx): ProductIssues {
  return {
    category: !p.categoryId || !ctx.leafIds.has(p.categoryId),
    price: !(p.priceUah != null && p.priceUah > 0),
    taken: ctx.byTitle.get(p.title.trim().toLowerCase()) ?? null,
  };
}

export const hasProductIssue = (i: ProductIssues) => i.category || i.price || i.taken != null;

export type Group = { kind: "single"; row: ReviewRow } | { kind: "product"; product: DraftProduct; rows: ReviewRow[] };

/** Строки в порядке документа; строки одного нового товара (варианты) идут вместе, на месте первой из них. */
export function groupRows(rows: ReviewRow[], products: DraftProduct[]): Group[] {
  const ofLine = new Map<string, DraftProduct>();
  for (const p of products) for (const id of p.lineIds) ofLine.set(id, p);
  const out: Group[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const p = r.decision.kind === "new" ? ofLine.get(r.line.id) : undefined;
    if (!p) out.push({ kind: "single", row: r });
    else if (!seen.has(p.id)) {
      seen.add(p.id);
      out.push({ kind: "product", product: p, rows: rows.filter((x) => p.lineIds.includes(x.line.id)) });
    }
  }
  return out;
}

export interface Todo {
  key: string;
  /** id элемента на странице, к которому прыгает ссылка. */
  anchor: string;
  label: string;
}

/** «1 строка, 2 строки, 5 строк». */
export function plural(n: number, forms: [string, string, string]): string {
  const m = n % 100;
  const k = n % 10;
  const f = m >= 11 && m <= 14 ? forms[2] : k === 1 ? forms[0] : k >= 2 && k <= 4 ? forms[1] : forms[2];
  return `${n} ${f}`;
}

const LINES: [string, string, string] = ["строка", "строки", "строк"];
const GOODS: [string, string, string] = ["товар", "товара", "товаров"];

export interface HeadState {
  currency: string;
  fxRate: number | null;
}

/** Всё, что осталось сделать, по смыслу и с адресом первого места. Пусто — можно принимать. */
export function draftTodos(rows: ReviewRow[], products: DraftProduct[], ctx: ReviewCtx, head: HeadState): Todo[] {
  const ofLine = new Map<string, DraftProduct>();
  for (const p of products) for (const id of p.lineIds) ofLine.set(id, p);
  const open = rows.filter((r) => r.decision.kind === "open");
  const noVariant = rows.filter((r) => rowIssue(r, ctx)?.includes("вариант"));
  const issues = products.map((p) => ({ p, i: productIssues(p, ctx) }));
  const out: Todo[] = [];
  const add = (key: string, anchor: string | undefined, label: string) => anchor && out.push({ key, anchor, label });
  if (open.length) add("open", `line-${open[0].line.id}`, `${plural(open.length, LINES)} без решения`);
  if (noVariant.length) add("variant", `line-${noVariant[0].line.id}`, `${plural(noVariant.length, LINES)} без варианта`);
  const noCat = issues.filter((x) => x.i.category);
  if (noCat.length) add("category", `prod-${noCat[0].p.id}`, `${plural(noCat.length, GOODS)} без категории`);
  const noPrice = issues.filter((x) => x.i.price);
  if (noPrice.length) add("price", `prod-${noPrice[0].p.id}`, `${plural(noPrice.length, GOODS)} без цены`);
  const taken = issues.filter((x) => x.i.taken);
  if (taken.length) add("taken", `prod-${taken[0].p.id}`, `уже есть в каталоге: ${taken.length}`);
  if (!head.currency) add("currency", "head", "не выбрана валюта");
  if (!(head.fxRate != null && head.fxRate > 0)) add("fx", "head", "не указан курс");
  if (rows.length > 0 && rows.every((r) => r.decision.kind === "skip")) add("allskip", "lines", "все строки пропущены");
  return out;
}

/** Сколько строк готово: решена сама и (если новый товар) товар заполнен. */
export function readyCount(rows: ReviewRow[], products: DraftProduct[], ctx: ReviewCtx): number {
  const ofLine = new Map<string, DraftProduct>();
  for (const p of products) for (const id of p.lineIds) ofLine.set(id, p);
  return rows.filter((r) => {
    const p = ofLine.get(r.line.id);
    return rowIssue(r, ctx) == null && !(p && hasProductIssue(productIssues(p, ctx)));
  }).length;
}

const SYMBOL: Record<string, string> = { CNY: "¥", USD: "$", EUR: "€", UAH: "₴", PLN: "zł", GBP: "£" };

/** Сумма в валюте документа: «¥16 007,70». */
export function fmtDoc(n: number, currency: string): string {
  const text = formatNumber(Math.abs(n), "ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sym = SYMBOL[currency];
  if (sym) return `${sym}${text}`;
  return currency ? `${text} ${currency}` : text;
}

/** Прокрутить к элементу и коротко подсветить. */
export function jumpTo(anchor: string): void {
  const el = document.getElementById(anchor);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-[var(--warn)]");
  window.setTimeout(() => el.classList.remove("ring-2", "ring-[var(--warn)]"), 1600);
}
