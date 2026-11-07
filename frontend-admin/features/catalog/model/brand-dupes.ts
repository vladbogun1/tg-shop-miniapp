/** «Бренды»: возможные дубликаты, фильтры-чипы и итог слияния. Чистые функции. */
import { normText } from "./search";
import type { AdminBrand } from "./types";

export type BrandFilter = "empty" | "nologo" | "dupes";

/** Ключ «похожести»: без регистра, пробелов, дефисов и знаков («Attack Shark» = «AttackShark»). */
export function dupeKey(s: string): string {
  return normText(s).replace(/[^\p{L}\p{N}]/gu, "");
}

/** Устойчивая подпись группы — по ней помним «Не дубликаты». */
export function dupeSignature(ids: string[]): string {
  return [...ids].sort().join("|");
}

/**
 * Возможные дубликаты: бренды, у которых название или алиас совпадают после `dupeKey`.
 * Группы без повторов, внутри — по числу товаров. Эвристика: бывают ложные срабатывания («Не дубликаты»).
 */
export function dupeGroups(brands: AdminBrand[]): AdminBrand[][] {
  const byKey = new Map<string, Set<string>>();
  for (const b of brands) {
    for (const k of [b.name, ...b.aliases].map(dupeKey)) {
      if (!k) continue;
      const set = byKey.get(k) ?? new Set<string>();
      set.add(b.id);
      byKey.set(k, set);
    }
  }
  const byId = new Map(brands.map((b) => [b.id, b]));
  const seen = new Set<string>();
  const out: AdminBrand[][] = [];
  for (const ids of byKey.values()) {
    if (ids.size < 2) continue;
    const sig = dupeSignature([...ids]);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push([...ids].map((id) => byId.get(id)!).sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name)));
  }
  return out.sort((a, b) => b.length - a.length || a[0].name.localeCompare(b[0].name));
}

/** Группы без отмеченных «Не дубликаты». */
export function activeGroups(groups: AdminBrand[][], dismissed: ReadonlySet<string>): AdminBrand[][] {
  return groups.filter((g) => !dismissed.has(dupeSignature(g.map((b) => b.id))));
}

export function dupeIds(groups: AdminBrand[][]): Set<string> {
  return new Set(groups.flatMap((g) => g.map((b) => b.id)));
}

export function filterBrands(brands: AdminBrand[], filters: ReadonlySet<BrandFilter>, dupes: ReadonlySet<string>): AdminBrand[] {
  return brands.filter(
    (b) =>
      (!filters.has("empty") || b.productCount === 0) &&
      (!filters.has("nologo") || !b.logoUrl) &&
      (!filters.has("dupes") || dupes.has(b.id))
  );
}

/** Что станет с главным брендом после слияния: товары суммируются, названия и алиасы остальных — его алиасы. */
export function mergePreview(target: AdminBrand, sources: AdminBrand[]) {
  const seen = new Set([dupeKey(target.name)]);
  const aliases: string[] = [];
  for (const a of [...target.aliases, ...sources.flatMap((s) => [s.name, ...s.aliases])]) {
    const k = dupeKey(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    aliases.push(a);
  }
  return { products: target.productCount + sources.reduce((n, s) => n + s.productCount, 0), aliases };
}
