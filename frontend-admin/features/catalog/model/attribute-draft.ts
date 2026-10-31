/**
 * Черновик редактора характеристики: строки опций и диапазонов, проверки, тело запроса.
 * Чистая логика (без React и api) — экран только показывает и меняет `Draft`.
 */
import type { SpecType } from "@shop/core/catalog";
import { isValidKey } from "./identifiers";
import type { AdminSpecAttribute, SpecAttributeWriteRequest } from "./types";

export interface OptRow {
  /** Stable React key. */
  uid: string;
  value: string;
  labelRu: string;
  labelUk: string;
  labelEn: string;
  aliases: string[];
  /** Value as stored (existing option) — renaming the slug of a used option is not allowed. */
  original?: string;
  usedCount?: number;
  valueTouched: boolean;
}

export interface BucketRow {
  uid: string;
  min: string;
  max: string;
  labelRu: string;
  labelUk: string;
  labelEn: string;
}

export interface Draft {
  labelRu: string;
  labelUk: string;
  labelEn: string;
  key: string;
  keyTouched: boolean;
  type: SpecType;
  unitRu: string;
  unitUk: string;
  unitEn: string;
  range: boolean;
  group: string;
  filterable: boolean;
  comparable: boolean;
  required: boolean;
  highlight: boolean;
  hint: string;
  options: OptRow[];
  buckets: BucketRow[];
}

let uidSeq = 0;
export const uid = () => `r${++uidSeq}`;

export const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(n);

export function parseNum(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** «до 45 г», «45–54 г», «65 г и больше» — the default bucket caption. */
export function autoBucketLabel(min: number | null, max: number | null, unit: string, lang: "ru" | "uk" | "en"): string {
  const u = unit ? ` ${unit}` : "";
  if (min === null && max !== null) return lang === "en" ? `under ${fmt(max)}${u}` : `до ${fmt(max)}${u}`;
  if (max === null && min !== null)
    return lang === "en" ? `${fmt(min)}${u}+` : lang === "uk" ? `${fmt(min)}${u} і більше` : `${fmt(min)}${u} и больше`;
  if (min !== null && max !== null) return `${fmt(min)}–${fmt(max)}${u}`;
  return "";
}

export function toDraft(a: AdminSpecAttribute | null, defaultGroup: string): Draft {
  return {
    labelRu: a?.labelRu ?? "",
    labelUk: a?.labelUk ?? "",
    labelEn: a?.labelEn ?? "",
    key: a?.key ?? "",
    keyTouched: !!a,
    type: a?.type ?? "enum",
    unitRu: a?.unitRu ?? "",
    unitUk: a?.unitUk ?? "",
    unitEn: a?.unitEn ?? "",
    range: a?.range ?? false,
    group: a?.group ?? defaultGroup,
    filterable: a?.filterable ?? true,
    comparable: a?.comparable ?? true,
    required: a?.required ?? false,
    highlight: a?.highlight ?? false,
    hint: a?.hint ?? "",
    options: (a?.options ?? [])
      .slice()
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((o) => ({
        uid: uid(),
        value: o.value,
        labelRu: o.labelRu,
        labelUk: o.labelUk,
        labelEn: o.labelEn,
        aliases: o.aliases,
        original: o.value,
        usedCount: o.usedCount,
        valueTouched: true,
      })),
    buckets: (a?.buckets ?? []).map((b) => ({
      uid: uid(),
      min: b.min === null ? "" : String(b.min),
      max: b.max === null ? "" : String(b.max),
      labelRu: b.labelRu,
      labelUk: b.labelUk,
      labelEn: b.labelEn,
    })),
  };
}

/** Ошибка ключа характеристики (или undefined). */
export function keyErrorOf(d: Draft, attribute: AdminSpecAttribute | null, takenKeys: string[]): string | undefined {
  if (!d.key) return "Нужен ключ";
  if (!isValidKey(d.key)) return "Только латиница a–z, цифры и _, с буквы";
  if (takenKeys.includes(d.key) && d.key !== attribute?.key) return "Такой ключ уже есть в этой категории или выше по дереву";
  return undefined;
}

export const isChoiceType = (t: SpecType) => t === "enum" || t === "multi";

/** Ошибки списка опций (enum/multi); для других типов пусто. */
export function optionErrorsOf(d: Draft): string[] {
  if (!isChoiceType(d.type)) return [];
  const errs: string[] = [];
  const seen = new Set<string>();
  d.options.forEach((o, i) => {
    if (!o.value || !/^[a-z0-9][a-z0-9_]*$/.test(o.value)) errs.push(`Опция ${i + 1}: значение — латиница, цифры, _`);
    else if (seen.has(o.value)) errs.push(`Опция ${i + 1}: значение «${o.value}» повторяется`);
    seen.add(o.value);
    if (!o.labelRu.trim()) errs.push(`Опция ${i + 1}: нет подписи ru`);
  });
  if (d.options.length === 0) errs.push("Добавьте хотя бы одну опцию");
  return errs;
}

/** Ошибки диапазонов фильтра (number); для других типов пусто. */
export function bucketErrorsOf(d: Draft): string[] {
  if (d.type !== "number") return [];
  const errs: string[] = [];
  d.buckets.forEach((b, i) => {
    const min = parseNum(b.min);
    const max = parseNum(b.max);
    if (Number.isNaN(min) || Number.isNaN(max)) errs.push(`Диапазон ${i + 1}: не число`);
    else if (min === null && max === null) errs.push(`Диапазон ${i + 1}: задайте «от» или «до»`);
    else if (min !== null && max !== null && min > max) errs.push(`Диапазон ${i + 1}: «от» больше «до»`);
  });
  return errs;
}

/** Тело запроса из черновика (порядок остаётся прежним; опции нумеруются по 10). */
export function buildAttributeBody(
  d: Draft,
  attribute: AdminSpecAttribute | null,
  categoryId: string | null
): SpecAttributeWriteRequest {
  const isChoice = isChoiceType(d.type);
  return {
    categoryId: attribute ? attribute.categoryId : categoryId,
    key: d.key,
    labelRu: d.labelRu.trim(),
    labelUk: d.labelUk.trim(),
    labelEn: d.labelEn.trim(),
    type: d.type,
    unitRu: d.type === "number" ? d.unitRu.trim() || null : null,
    unitUk: d.type === "number" ? d.unitUk.trim() || null : null,
    unitEn: d.type === "number" ? d.unitEn.trim() || null : null,
    range: d.type === "number" && d.range,
    group: d.group,
    filterable: d.type === "text" ? false : d.filterable,
    comparable: d.comparable,
    required: d.required,
    highlight: d.highlight,
    sortOrder: attribute?.sortOrder ?? 0,
    hint: d.hint.trim() || null,
    buckets:
      d.type === "number" && d.buckets.length
        ? d.buckets.map((b) => {
            const min = parseNum(b.min);
            const max = parseNum(b.max);
            return {
              min,
              max,
              labelRu: b.labelRu.trim() || autoBucketLabel(min, max, d.unitRu, "ru"),
              labelUk: b.labelUk.trim() || autoBucketLabel(min, max, d.unitUk || d.unitRu, "uk"),
              labelEn: b.labelEn.trim() || autoBucketLabel(min, max, d.unitEn, "en"),
            };
          })
        : null,
    options: isChoice
      ? d.options.map((o, i) => ({
          value: o.value,
          labelRu: o.labelRu.trim(),
          labelUk: o.labelUk.trim() || o.labelRu.trim(),
          labelEn: o.labelEn.trim() || o.labelRu.trim(),
          aliases: o.aliases,
          sortOrder: (i + 1) * 10,
        }))
      : [],
  };
}
