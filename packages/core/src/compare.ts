/**
 * Product comparison, shared by the Mini App and the website.
 *
 * What is kept: only the product ids (+ the category, to group without loading anything), per
 * device in localStorage — no account needed, guests compare too, and prices/specs always come
 * fresh from the catalog when the comparison opens. Products that are gone are dropped silently.
 *
 * A mouse and a keyboard have nothing in common to compare, so the list is split into groups by the
 * ROOT category (Клавиатуры › Магнитные and › Механические land in one group and are compared by the
 * union of their characteristics). Rows: the basics (price, rating, stock, brand, condition), then
 * every `comparable` characteristic that at least one of the products has, in schema order.
 */
import { attributesFor, categoryPath, formatSpec, type CatalogCategory, type CatalogFields, type CatalogSchema, type SpecAttribute, type SpecGroup } from "./catalog";

/** Columns in one group. Two fit a phone, four a laptop; more is just scrolling sideways. */
export const COMPARE_MAX_PER_GROUP = 6;
/** All groups together. */
export const COMPARE_MAX_TOTAL = 24;
/** localStorage key, same name in both apps (different origins, so no clash). */
export const COMPARE_STORAGE_KEY = "compare-v1";
/** Group of products without a category. */
export const COMPARE_OTHER_GROUP = "_other";

export interface CompareEntry {
  id: string;
  /** Group key at the time it was added (root category id) — lets the badge/limits work offline. */
  group: string;
  addedAt: number;
}

/** Root category id of a product's category (the comparison group). */
export function compareGroupOf(schema: Pick<CatalogSchema, "categories">, categoryId: string | null | undefined): string {
  const path = categoryPath(schema, categoryId);
  return path[0]?.id ?? (categoryId || COMPARE_OTHER_GROUP);
}

export type CompareAddResult = "added" | "exists" | "group-full" | "total-full";

/** Pure add: returns the new list and what happened (the UI turns the refusals into a toast). */
export function compareAdd(entries: CompareEntry[], id: string, group: string, now = Date.now()): { entries: CompareEntry[]; result: CompareAddResult } {
  if (entries.some((e) => e.id === id)) return { entries, result: "exists" };
  if (entries.length >= COMPARE_MAX_TOTAL) return { entries, result: "total-full" };
  if (entries.filter((e) => e.group === group).length >= COMPARE_MAX_PER_GROUP) return { entries, result: "group-full" };
  return { entries: [...entries, { id, group, addedAt: now }], result: "added" };
}

/** Reads the stored list defensively (old/corrupt values → empty). */
export function parseCompareEntries(raw: unknown): CompareEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CompareEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const { id, group, addedAt } = e as Partial<CompareEntry>;
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, group: typeof group === "string" && group ? group : COMPARE_OTHER_GROUP, addedAt: typeof addedAt === "number" ? addedAt : 0 });
  }
  return out.slice(0, COMPARE_MAX_TOTAL);
}

// ---- groups ----------------------------------------------------------------------------------

export interface ComparableProduct extends CatalogFields {
  id: string;
  title: string;
  priceMinor: number;
  ratingAvg?: number | null;
  ratingCount?: number;
}

export interface CompareGroup<P> {
  key: string;
  /** Root category; null for products without one. */
  category: CatalogCategory | null;
  items: P[];
}

/**
 * Stored entries + the loaded products → groups in the order the first product of each was added,
 * products in the order they were added. Entries whose product is not in `products` (sold out of
 * the catalog, hidden) are skipped; the group is recomputed from the live category, so a product
 * moved to another category lands in the right group.
 */
export function compareGroups<P extends ComparableProduct>(schema: CatalogSchema, entries: CompareEntry[], products: P[]): CompareGroup<P>[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const groups = new Map<string, CompareGroup<P>>();
  for (const e of [...entries].sort((a, b) => a.addedAt - b.addedAt)) {
    const p = byId.get(e.id);
    if (!p) continue;
    const key = compareGroupOf(schema, p.categoryId);
    if (!groups.has(key)) {
      groups.set(key, { key, category: schema.categories.find((c) => c.id === key) ?? null, items: [] });
    }
    groups.get(key)!.items.push(p);
  }
  return [...groups.values()];
}

// ---- rows ------------------------------------------------------------------------------------

export interface CompareCell {
  text: string | null;
  /** Best in the row (lowest price, highest rating) — only when the values differ. */
  best?: boolean;
}

export interface CompareRow {
  key: string;
  label: string;
  cells: CompareCell[];
  /** Not every product has the same value (a missing value counts as different). */
  differs: boolean;
}

export interface CompareSection {
  key: string;
  label: string;
  rows: CompareRow[];
}

const norm = (s: string | null) => (s ?? "").toLocaleLowerCase().replace(/\s+/g, " ").trim();

function differs(cells: CompareCell[]): boolean {
  if (cells.length < 2) return false;
  const first = norm(cells[0].text);
  return cells.some((c) => norm(c.text) !== first);
}

/** Characteristics shown for a set of products: the union of their categories' `comparable` ones. */
export function compareAttributes(schema: CatalogSchema, products: ComparableProduct[]): SpecAttribute[] {
  const seen = new Map<string, SpecAttribute>();
  for (const p of products) {
    for (const a of attributesFor(schema, p.categoryId)) if (a.comparable && !seen.has(a.id)) seen.set(a.id, a);
  }
  return [...seen.values()];
}

export interface CompareBasics<P> {
  /** Section title of the basics ("Основное"). */
  title: string;
  /** Extra leading rows the app formats itself (price, stock, …) — `best` is computed here when `rank` is given. */
  rows: { key: string; label: string; value: (p: P) => string | null; rank?: (p: P) => number | null; higherIsBetter?: boolean }[];
}

/**
 * The table: the app's basic rows first, then the characteristics grouped like on the product page.
 * Rows where nobody has a value are dropped. `yesNo` = [yes, no] in the UI language.
 */
export function compareSections<P extends ComparableProduct>(
  schema: CatalogSchema,
  products: P[],
  locale: string,
  yesNo: [string, string],
  basics?: CompareBasics<P>,
): CompareSection[] {
  const out: CompareSection[] = [];

  if (basics) {
    const rows: CompareRow[] = [];
    for (const b of basics.rows) {
      const cells: CompareCell[] = products.map((p) => ({ text: b.value(p) }));
      if (cells.every((c) => !c.text)) continue;
      const d = differs(cells);
      if (b.rank && d) {
        const ranks = products.map((p) => b.rank!(p));
        const valid = ranks.filter((r): r is number => r !== null && Number.isFinite(r));
        if (valid.length >= 2) {
          const best = b.higherIsBetter ? Math.max(...valid) : Math.min(...valid);
          // a tie of everyone is no "best"
          if (valid.some((r) => r !== best)) ranks.forEach((r, i) => (cells[i].best = r === best));
        }
      }
      rows.push({ key: b.key, label: b.label, cells, differs: d });
    }
    if (rows.length) out.push({ key: "_basics", label: basics.title, rows });
  }

  const attrs = compareAttributes(schema, products);
  const groups = new Map<string, SpecGroup>(schema.groups.map((g) => [g.key, g]));
  const bySection = new Map<string, CompareRow[]>();
  for (const a of attrs) {
    const cells: CompareCell[] = products.map((p) => ({ text: formatSpec(a, p.specs?.[a.key], locale, yesNo) }));
    if (cells.every((c) => !c.text)) continue;
    if (!bySection.has(a.group)) bySection.set(a.group, []);
    bySection.get(a.group)!.push({ key: a.key, label: a.label, cells, differs: differs(cells) });
  }
  const ordered = [...bySection.keys()].sort((a, b) => (groups.get(a)?.sort ?? 999) - (groups.get(b)?.sort ?? 999));
  for (const k of ordered) out.push({ key: k, label: groups.get(k)?.label ?? k, rows: bySection.get(k)! });
  return out;
}

/** Same sections with the identical rows taken out (and sections left empty dropped). */
export function onlyDifferences(sections: CompareSection[]): CompareSection[] {
  return sections.map((s) => ({ ...s, rows: s.rows.filter((r) => r.differs) })).filter((s) => s.rows.length > 0);
}
