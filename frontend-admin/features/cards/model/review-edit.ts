/**
 * «Карточки», панель проверки одной карточки: правки текстов и характеристик → тело запроса «Принять»,
 * строки характеристик «было → стало», разбивка на группы. Чистая логика (экран — `ui/review`).
 */
import type { CardItem } from "./item";
import type { CardChange, CardReviewData } from "./meta";
import { attributesForCategory, type CardAttribute, type CardSchema } from "./schema";
import { TEXT_FIELDS, type TextField } from "./types";
import { metaOf } from "./view";
import type { CardAcceptBody, CardTextTranslations } from "./wire";

export type Lang = "ru" | "uk" | "en";
export const LANG_LABEL: Record<Lang, string> = { ru: "RU", uk: "UA", en: "EN" };
export const LANGS: readonly Lang[] = ["ru", "uk", "en"];

/** Ключ правки текста: «язык/поле», например `uk/title`. */
export const textKey = (lang: Lang, field: TextField): string => `${lang}/${field}`;
const splitKey = (k: string): [Lang, TextField] => k.split("/") as [Lang, TextField];

/** Текущий текст поля: русский — в самом товаре, uk/en — в переводах карточки. */
export function currentTextOf(item: CardItem, translations: CardReviewData["translations"] | undefined, lang: Lang, field: TextField): string {
  if (lang === "ru") return (field === "title" ? item.title : field === "description" ? item.description : item.conditionNote) ?? "";
  return translations?.[lang]?.[field]?.text ?? "";
}

/** Только то, что действительно отличается от текущего текста. */
export function realTextEdits(texts: Record<string, string>, current: (lang: Lang, field: TextField) => string): [string, string][] {
  return Object.entries(texts).filter(([k, v]) => {
    const [lang, field] = splitKey(k);
    return v.trim() !== current(lang, field).trim();
  });
}

/** Тело «Принять»: правленные характеристики и тексты (русские название/описание — в товар, uk/en — переводами). */
export function buildAcceptBody(specs: Record<string, unknown> | null, edits: [string, string][]): CardAcceptBody {
  const body: CardAcceptBody = {};
  if (specs) body.specs = specs;
  const tr: Partial<Record<"uk" | "en", CardTextTranslations>> = {};
  for (const [k, v] of edits) {
    const [lang, field] = splitKey(k);
    const text = v.trim();
    if (lang !== "ru") (tr[lang] ??= {})[field] = text;
    else if (field === "title") body.title = text;
    else if (field === "description") body.description = text;
  }
  if (Object.keys(tr).length) body.translations = tr;
  return body;
}

/** Сколько изменённых ИИ текстов в каждом языке (для значков вкладок). */
export function changedTextCount(changes: Record<string, unknown>, lang: Lang): number {
  return TEXT_FIELDS.filter((f) => changes[textKey(lang, f)]).length;
}

// ---- характеристики ---------------------------------------------------------------------

export interface SpecRow {
  key: string;
  attr: CardAttribute | undefined;
  label: string;
  value: unknown;
  change: CardChange | undefined;
  confidence: number | null;
  src: string | null;
  missing: boolean;
}

/** Строки: все ключи схемы категории, значения товара и изменённые последним импортом; пустые без изменений отброшены. */
export function buildSpecRows(item: CardItem, schema: CardSchema | undefined, changed: Record<string, CardChange>): SpecRow[] {
  const attrs = schema ? attributesForCategory(schema, item.categorySlug) : [];
  const specs = item.specs ?? {};
  const fields = metaOf(item).fields ?? {};
  const missing = new Set(item.missingRequired ?? []);
  const keys = [...new Set([...attrs.map((a) => a.key), ...Object.keys(specs), ...Object.keys(changed)])];
  return keys
    .map((key): SpecRow => {
      const attr = attrs.find((a) => a.key === key);
      const change = changed[key];
      return {
        key,
        attr,
        label: attr?.labelRu ?? key,
        value: specs[key],
        change,
        confidence: change?.c ?? fields[key]?.c ?? null,
        src: change?.src ?? fields[key]?.src ?? null,
        missing: missing.has(key),
      };
    })
    .filter((r) => r.change || r.missing || (r.value !== undefined && r.value !== null));
}

export interface SpecGroups {
  /** Изменено последним импортом — самые неуверенные первыми. */
  changed: SpecRow[];
  /** Обязательные, ещё пустые. */
  empty: SpecRow[];
  same: SpecRow[];
  /** Сколько изменённых с уверенностью ниже 60 %. */
  low: number;
}

export function groupSpecRows(rows: SpecRow[]): SpecGroups {
  const changed = rows.filter((r) => r.change).sort((a, b) => (a.confidence ?? 101) - (b.confidence ?? 101));
  return {
    changed,
    empty: rows.filter((r) => !r.change && r.missing),
    same: rows.filter((r) => !r.change && !r.missing),
    low: changed.filter((r) => r.confidence != null && r.confidence < 60).length,
  };
}
