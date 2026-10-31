/** Поиск бренда в выпадающем списке: по названию и алиасам, лучшие совпадения первыми. */
import type { AdminBrand } from "./types";

export interface BrandHit {
  b: AdminBrand;
  score: number;
  /** Алиас, по которому нашли (когда название не совпало). */
  alias: string | undefined;
}

/** Нижний регистр, «ё» = «е», пробелы/подчёркивания/дефисы — один пробел. */
export const normBrandQuery = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[\s_-]+/g, " ").trim();

function scoreOf(nq: string, name: string, alias: string | undefined): number {
  if (!nq) return 1;
  if (name === nq) return 4;
  if (name.startsWith(nq)) return 3;
  if (name.includes(nq)) return 2;
  return alias ? 1 : -1;
}

/** До 50 брендов: точное имя, начало имени, часть имени, алиас; при равенстве — по числу товаров, затем по имени. */
export function rankBrands(brands: AdminBrand[], query: string, exclude?: string[]): BrandHit[] {
  const nq = normBrandQuery(query);
  return brands
    .filter((b) => !exclude?.includes(b.id))
    .map((b) => {
      const name = normBrandQuery(b.name);
      const alias = b.aliases.find((a) => normBrandQuery(a).includes(nq));
      return { b, score: scoreOf(nq, name, alias), alias: nq && !name.includes(nq) ? alias : undefined };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.b.productCount - a.b.productCount || a.b.name.localeCompare(b.b.name))
    .slice(0, 50);
}

/** Есть бренд с таким названием или алиасом (тогда «Создать» не предлагаем). */
export function hasBrandNamed(brands: AdminBrand[], query: string): boolean {
  const nq = normBrandQuery(query);
  return brands.some((b) => normBrandQuery(b.name) === nq || b.aliases.some((a) => normBrandQuery(a) === nq));
}
