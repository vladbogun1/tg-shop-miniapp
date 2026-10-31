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

/** Поля новой характеристики: что видит редактор, пока ничего не введено. */
const NEW_ATTRIBUTE = {
  labelRu: "",
  labelUk: "",
  labelEn: "",
  key: "",
  type: "enum" as SpecType,
  unitRu: null as string | null | undefined,
  unitUk: null as string | null | undefined,
  unitEn: null as string | null | undefined,
  range: false,
  filterable: true,
  comparable: true,
  required: false,
  highlight: false,
  hint: null as string | null | undefined,
  options: [] as AdminSpecAttribute["options"],
  buckets: null as AdminSpecAttribute["buckets"],
};

const toOptRow = (o: AdminSpecAttribute["options"][number]): OptRow => ({
  uid: uid(),
  value: o.value,
  labelRu: o.labelRu,
  labelUk: o.labelUk,
  labelEn: o.labelEn,
  aliases: o.aliases,
  original: o.value,
  usedCount: o.usedCount,
  valueTouched: true,
});

const toBucketRow = (b: NonNullable<AdminSpecAttribute["buckets"]>[number]): BucketRow => ({
  uid: uid(),
  min: b.min === null ? "" : String(b.min),
  max: b.max === null ? "" : String(b.max),
  labelRu: b.labelRu,
  labelUk: b.labelUk,
  labelEn: b.labelEn,
});

export function toDraft(a: AdminSpecAttribute | null, defaultGroup: string): Draft {
  const src = a ?? NEW_ATTRIBUTE;
  return {
    labelRu: src.labelRu,
    labelUk: src.labelUk,
    labelEn: src.labelEn,
    key: src.key,
    keyTouched: !!a,
    type: src.type,
    unitRu: src.unitRu ?? "",
    unitUk: src.unitUk ?? "",
    unitEn: src.unitEn ?? "",
    range: src.range,
    group: a ? a.group : defaultGroup,
    filterable: src.filterable,
    comparable: src.comparable,
    required: src.required,
    highlight: src.highlight,
    hint: src.hint ?? "",
    options: src.options
      .slice()
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map(toOptRow),
    buckets: (src.buckets ?? []).map(toBucketRow),
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

function buildBuckets(d: Draft): SpecAttributeWriteRequest["buckets"] {
  if (d.type !== "number" || d.buckets.length === 0) return null;
  return d.buckets.map((b) => {
    const min = parseNum(b.min);
    const max = parseNum(b.max);
    return {
      min,
      max,
      labelRu: b.labelRu.trim() || autoBucketLabel(min, max, d.unitRu, "ru"),
      labelUk: b.labelUk.trim() || autoBucketLabel(min, max, d.unitUk || d.unitRu, "uk"),
      labelEn: b.labelEn.trim() || autoBucketLabel(min, max, d.unitEn, "en"),
    };
  });
}

function buildOptions(d: Draft): SpecAttributeWriteRequest["options"] {
  if (!isChoiceType(d.type)) return [];
  return d.options.map((o, i) => ({
    value: o.value,
    labelRu: o.labelRu.trim(),
    labelUk: o.labelUk.trim() || o.labelRu.trim(),
    labelEn: o.labelEn.trim() || o.labelRu.trim(),
    aliases: o.aliases,
    sortOrder: (i + 1) * 10,
  }));
}

/** Тело запроса из черновика (порядок остаётся прежним; опции нумеруются по 10). */
export function buildAttributeBody(
  d: Draft,
  attribute: AdminSpecAttribute | null,
  categoryId: string | null
): SpecAttributeWriteRequest {
  const isNumber = d.type === "number";
  return {
    categoryId: attribute ? attribute.categoryId : categoryId,
    key: d.key,
    labelRu: d.labelRu.trim(),
    labelUk: d.labelUk.trim(),
    labelEn: d.labelEn.trim(),
    type: d.type,
    unitRu: isNumber ? d.unitRu.trim() || null : null,
    unitUk: isNumber ? d.unitUk.trim() || null : null,
    unitEn: isNumber ? d.unitEn.trim() || null : null,
    range: isNumber && d.range,
    group: d.group,
    filterable: d.type === "text" ? false : d.filterable,
    comparable: d.comparable,
    required: d.required,
    highlight: d.highlight,
    sortOrder: attribute?.sortOrder ?? 0,
    hint: d.hint.trim() || null,
    buckets: buildBuckets(d),
    options: buildOptions(d),
  };
}
