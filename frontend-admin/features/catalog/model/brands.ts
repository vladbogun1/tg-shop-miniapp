/** Что экран «Бренды» считает из списка: поиск, сортировка, счётчики, адрес сайта. */
import { normText } from "./search";
import type { AdminBrand, BrandLogoMode, BrandWriteRequest } from "./types";

export type BrandSort = "name" | "products";

export function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Поиск по названию, slug и алиасам + сортировка («По товарам» или А–Я). */
export function visibleBrands(brands: AdminBrand[], search: string, sort: BrandSort): AdminBrand[] {
  const nq = normText(search);
  const list = brands.filter(
    (b) => !nq || normText(b.name).includes(nq) || b.slug.includes(nq) || b.aliases.some((a) => normText(a).includes(nq))
  );
  return list.sort((a, b) =>
    sort === "products" ? b.productCount - a.productCount || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)
  );
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
