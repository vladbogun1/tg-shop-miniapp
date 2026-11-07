/**
 * «Карточки», проверка ответа ИИ: категория и бренд, выбранные человеком из существующих (один и тот же разбор у
 * встроенного ИИ и ручного пути через ChatGPT). Новая категория перепроверяет характеристики ответа по её схеме —
 * то, что ИИ вписал для старой категории, может стать «нет такого ключа». Чистая логика.
 */
import { productLevel } from "./review";
import { reviewFields, type Entry } from "./review-parts";
import { attributesForCategory, categoryOf, categoryPathName, isLeafCategory, leafCategories, type CardSchema } from "./schema";
import type { CardIssue, ProductReview } from "./types";

export interface Choice {
  value: string;
  label: string;
}

/** Из чего выбирать в проверке: схема (конечные категории) и имена брендов каталога. */
export interface ReviewChoices {
  schema: CardSchema;
  brands: readonly string[];
}

type Edit = { review: ProductReview; error: string | null };

/** Конечные категории в порядке дерева, подпись — путь («Мышки › Беспроводные»). */
export function categoryChoices(schema: CardSchema): Choice[] {
  return leafCategories(schema).map((c) => ({ value: c.slug, label: categoryPathName(schema, c.slug) }));
}

export function brandChoices(brands: readonly string[]): Choice[] {
  return [...new Set(brands.map((b) => b.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")).map((b) => ({ value: b, label: b }));
}

/** Сводки по полям («отброшено», «предложено», «нечего применить») пересчитываются вместе с полями — старые убираем. */
const DERIVED = /^(полей отброшено|предложений новых опций|нечего применить)/;
const NOTHING = "нечего применить: нет ни одного корректного поля или текста";

/** Ответ ИИ по характеристикам в том виде, в каком его читает `reviewFields` (с правками человека в `raw`). */
function entryOf(r: ProductReview): Entry {
  return {
    specs: Object.fromEntries(r.fields.map((f) => [f.key, f.raw])),
    confidence: Object.fromEntries(r.fields.flatMap((f) => (f.confidence === null ? [] : [[f.key, f.confidence]]))),
    field_sources: Object.fromEntries(r.fields.flatMap((f) => (f.src ? [[f.key, f.src]] : []))),
  };
}

/**
 * Другая категория: только существующий лист и не нынешняя (её оставляют, сняв флажок). Характеристики ответа
 * проверяются заново по схеме выбранной категории; предложения новых опций — тоже.
 */
export function editCategory(r: ProductReview, slug: string, schema: CardSchema): Edit {
  if (!categoryOf(schema, slug)) return { review: r, error: "Такой категории нет в каталоге" };
  if (!isLeafCategory(schema, slug)) return { review: r, error: "Выберите конечную категорию" };
  const current = r.item.categorySlug ?? null;
  if (slug === current) return { review: r, error: "Это нынешняя категория — чтобы её не менять, снимите флажок" };
  const issues: CardIssue[] = r.issues.filter((i) => !DERIVED.test(i.text));
  const proposals = r.proposals.filter((p) => !p.auto);
  const fields = reviewFields(entryOf(r), r.item, attributesForCategory(schema, slug), slug, proposals, issues);
  if (proposals.length) issues.push({ level: "warn", text: `предложений новых опций: ${proposals.length}` });
  const out = {
    ...r,
    issues,
    proposals,
    fields,
    targetCategory: slug,
    category: { from: current, to: slug, valid: true, issues: [{ level: "warn" as const, text: "смена категории" }] },
  };
  const level = productLevel(out);
  if (level === "error" && !issues.some((i) => i.level === "error")) issues.push({ level: "error", text: NOTHING });
  return { review: { ...out, level }, error: null };
}

/** Другой бренд — только из списка брендов каталога (новый заводят в «Брендах»). */
export function editBrand(r: ProductReview, name: string, brands: readonly string[]): Edit {
  const found = brands.find((b) => b.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  if (!found) return { review: r, error: "Такого бренда нет — добавьте его в «Брендах»" };
  const current = (r.item.brand ?? "").trim();
  if (found.trim() === current) return { review: r, error: "Это нынешний бренд — чтобы его не менять, снимите флажок" };
  const out = { ...r, brand: { from: current || null, to: found.trim(), valid: true, issues: [{ level: "warn" as const, text: current ? "смена бренда" : "новый бренд" }] } };
  return { review: { ...out, level: productLevel(out) }, error: null };
}
