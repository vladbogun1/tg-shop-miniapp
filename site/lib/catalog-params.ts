import type { CatalogState } from "@/components/catalog/CatalogView";
import { PAGE_SIZE } from "./config";
import { first } from "./route";
import { parseSort } from "./server-api";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** URL query → catalog state (prices in the URL are whole hryvnias, the API wants kopecks). */
export async function parseCatalogState(basePath: string, sp: SearchParams): Promise<CatalogState> {
  const p = await sp;
  const inStockRaw = first(p.inStock);
  const priceRaw = Number(first(p.priceMax) ?? "");
  const pageRaw = Number(first(p.page) ?? "1");
  const q = (first(p.q) ?? "").trim().slice(0, 100);
  return {
    basePath,
    q: q || undefined,
    inStock: inStockRaw === "1" || inStockRaw === "true",
    priceMax: Number.isFinite(priceRaw) && priceRaw > 0 ? Math.round(priceRaw) * 100 : undefined,
    sort: parseSort(first(p.sort)),
    page: Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1,
  };
}

export function toApiQuery(s: CatalogState, category?: string) {
  return {
    category,
    q: s.q,
    inStock: s.inStock,
    priceMax: s.priceMax,
    sort: s.sort,
    page: s.page - 1,
    size: PAGE_SIZE,
  };
}
