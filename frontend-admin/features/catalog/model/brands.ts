/** Что экран «Бренды» считает из списка: поиск, сортировка, счётчики, адрес сайта. */
import { normText } from "./search";
import { slugify } from "./slug";
import type { AdminBrand, BrandLogoMode, BrandWriteRequest } from "./types";

/** Столбец сортировки таблицы: по товарам (убывание по умолчанию), остальные — по возрастанию. */
export type BrandSort = "name" | "products" | "slug" | "site";

export function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Поиск по названию, slug и алиасам + сортировка; `dir` = -1 переворачивает естественный порядок столбца. */
export function visibleBrands(brands: AdminBrand[], search: string, sort: BrandSort, dir: 1 | -1 = 1): AdminBrand[] {
  const nq = normText(search);
  const list = brands.filter(
    (b) => !nq || normText(b.name).includes(nq) || b.slug.includes(nq) || b.aliases.some((a) => normText(a).includes(nq))
  );
  const byName = (a: AdminBrand, b: AdminBrand) => a.name.localeCompare(b.name);
  const natural = (a: AdminBrand, b: AdminBrand): number => {
    if (sort === "products") return b.productCount - a.productCount || byName(a, b);
    if (sort === "slug") return a.slug.localeCompare(b.slug);
    if (sort === "site") {
      const ha = a.website ? hostOf(a.website) : "";
      const hb = b.website ? hostOf(b.website) : "";
      if (!ha !== !hb) return ha ? -1 : 1; // без сайта — в конец
      return ha.localeCompare(hb) || byName(a, b);
    }
    return byName(a, b);
  };
  return list.sort((a, b) => natural(a, b) * dir);
}

/** Другой бренд с таким же названием или алиасом (для подсказки «Уже есть»). */
export function findDuplicate(brands: AdminBrand[], editingId: string | undefined, name: string): AdminBrand | undefined {
  const n = normText(name);
  return brands.find((b) => b.id !== editingId && (normText(b.name) === n || b.aliases.some((a) => normText(a) === n)));
}

/** Поля формы бренда. */
export interface BrandForm {
  name: string;
  slug: string;
  website: string;
  aliases: string[];
  /** "" = no logo. */
  logoUrl: string;
  logoMode: BrandLogoMode;
}

export const EMPTY_BRAND_FORM: BrandForm = { name: "", slug: "", website: "", aliases: [], logoUrl: "", logoMode: "MONO" };

export function toBrandForm(b: AdminBrand | null): BrandForm {
  return b
    ? { name: b.name, slug: b.slug, website: b.website ?? "", aliases: b.aliases, logoUrl: b.logoUrl ?? "", logoMode: b.logoMode }
    : EMPTY_BRAND_FORM;
}

export function buildBrandBody(form: BrandForm): BrandWriteRequest {
  return {
    name: form.name.trim(),
    slug: form.slug.trim(),
    website: form.website.trim(),
    aliases: form.aliases,
    logoUrl: form.logoUrl,
    logoMode: form.logoMode,
  };
}

/**
 * Смена slug существующего бренда: что было и что станет (null — адрес тот же или бренд новый).
 * Пустое поле slug сервер заполняет из названия, поэтому сравниваем с тем же правилом, что и он.
 */
export function brandSlugChange(editing: AdminBrand | null, form: BrandForm): { from: string; to: string } | null {
  if (!editing) return null;
  const to = slugify(form.slug.trim() || form.name);
  return to && to !== editing.slug ? { from: editing.slug, to } : null;
}
