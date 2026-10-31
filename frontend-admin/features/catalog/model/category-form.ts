/** Форма категории: поля, лимиты колонок, счётчик слов SEO-текста, тело запроса. */
import type { AdminCategory, CategoryWriteRequest } from "./types";

/** Limits of the backend columns (V36). */
export const SEO_TITLE_MAX = 255;
export const SEO_DESCRIPTION_MAX = 512;
export const H1_MAX = 255;
export const INTRO_MAX = 10_000;

export function wordCount(text: string): number {
  const words = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return words ? words.length : 0;
}


export interface Form {
  name: string;
  slug: string;
  parentId: string;
  showInMenu: boolean;
  artKind: string;
  seoTitle: string;
  seoDescription: string;
  h1: string;
  introText: string;
}


export function toForm(c: AdminCategory | null, parentId: string | null): Form {
  return {
    name: c?.name ?? "",
    slug: c?.slug ?? "",
    parentId: (c ? c.parentId : parentId) ?? "",
    showInMenu: c?.showInMenu ?? true,
    artKind: c?.artKind ?? "",
    seoTitle: c?.seoTitle ?? "",
    seoDescription: c?.seoDescription ?? "",
    h1: c?.h1 ?? "",
    introText: c?.introText ?? "",
  };
}

/** Поля SEO, правка которых делает переводы устаревшими. */
export const SEO_SOURCE_KEYS = ["seoTitle", "seoDescription", "h1", "introText"] as const;

/** Тело запроса из формы; для новой категории порядок — в конец среди соседей. */
export function buildCategoryBody(f: Form, isEdit: boolean): CategoryWriteRequest {
  return {
    name: f.name.trim(),
    slug: f.slug.trim(),
    // PATCH: null keeps — "" makes it a root / sets the tile art to «авто».
    parentId: isEdit ? f.parentId : f.parentId || null,
    showInMenu: f.showInMenu,
    artKind: f.artKind,
    seoTitle: f.seoTitle.trim(),
    seoDescription: f.seoDescription.trim(),
    h1: f.h1.trim(),
    introText: f.introText.trim(),
  };
}

/** sortOrder новой категории: после последней из соседей (с тем же родителем). */
export function nextSortOrder(categories: AdminCategory[], parentId: string): number {
  const siblings = categories.filter((c) => (c.parentId ?? "") === parentId);
  return siblings.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 10;
}
