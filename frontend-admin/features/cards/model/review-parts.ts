/**
 * «Карточки»: разбор записи одного товара из ответа ИИ по частям — категория, бренд, характеристики, предложения
 * новых опций, тексты с переводами. Собирает их `review.ts`. Чистая логика.
 */
import { checkValue } from "./check-value";
import type { CardItem } from "./item";
import { confidenceOf, levelOf } from "./level";
import { categoryOf, isLeafCategory, type CardAttribute, type CardSchema } from "./schema";
import { checkText, langTexts } from "./text";
import {
  TEXT_FIELDS,
  type CardIssue,
  type ChangeReview,
  type FieldReview,
  type Proposal,
  type TextField,
  type TextReview,
} from "./types";
import { sameValue } from "./value";

export type Entry = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function validSpecsOf(fields: FieldReview[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f.value !== undefined) out[f.key] = f.value;
  return out;
}

// ---- category / brand ------------------------------------------------------

export function reviewCategory(e: Entry, item: CardItem, schema: CardSchema): { category: ChangeReview | null; targetCategory: string | null } {
  const currentCat = item.categorySlug ?? null;
  const catRaw = typeof e.category === "string" ? e.category.trim() : typeof e.categorySlug === "string" ? e.categorySlug.trim() : "";
  if (!catRaw || catRaw === currentCat) return { category: null, targetCategory: currentCat };
  const exists = !!categoryOf(schema, catRaw);
  const leaf = exists && isLeafCategory(schema, catRaw);
  const text = !exists ? `нет категории «${catRaw}» — не применится` : !leaf ? `«${catRaw}» не лист — не применится` : "смена категории";
  const level = leaf ? "warn" : "error";
  const category: ChangeReview = { from: currentCat, to: catRaw, valid: leaf, issues: [{ level, text }] };
  return { category, targetCategory: leaf ? catRaw : currentCat };
}

export function reviewBrand(e: Entry, item: CardItem): ChangeReview | null {
  const brandRaw = typeof e.brand === "string" ? e.brand.trim() : "";
  const curBrand = (item.brand ?? "").trim();
  if (!brandRaw) return null;
  if (brandRaw.toLocaleLowerCase() !== curBrand.toLocaleLowerCase()) {
    return {
      from: curBrand || null,
      to: brandRaw,
      valid: brandRaw.length <= 128,
      issues: [{ level: "warn", text: curBrand ? "смена бренда" : "новый бренд" }],
    };
  }
  if (brandRaw !== curBrand) return { from: curBrand || null, to: brandRaw, valid: true, issues: [{ level: "info", text: "другой регистр" }] };
  return null;
}

// ---- characteristics -------------------------------------------------------

/** Ссылка-источник значения поля из `field_sources` (только http/https). */
function sourceOf(srcRaw: unknown, key: string): string | null {
  const v = isPlainObject(srcRaw) ? srcRaw[key] : null;
  return typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim()) ? v.trim() : null;
}

function confidenceNote(confidence: number | null): CardIssue | null {
  if (confidence === null) return { level: "warn", text: "нет уверенности" };
  if (confidence < 40) return { level: "warn", text: `уверенность ${confidence} % — догадка` };
  if (confidence < 60) return { level: "warn", text: `уверенность ${confidence} %` };
  return null;
}

interface FieldCtx {
  byKey: Map<string, CardAttribute>;
  targetCategory: string | null;
  before: Record<string, unknown>;
  confRaw: Record<string, unknown>;
  srcRaw: unknown;
  proposals: Proposal[];
}

function unknownKeyField(key: string, raw: unknown, ctx: FieldCtx, confidence: number | null, issues: CardIssue[]): FieldReview {
  issues.push({ level: "error", text: ctx.targetCategory ? "нет такого ключа в схеме категории" : "нет такого ключа (у товара нет категории)" });
  return { key, attr: null, label: key, raw, before: ctx.before[key], changed: true, confidence, src: null, issues, level: "error", preselect: false };
}

function reviewField(rawKey: string, rawVal: unknown, ctx: FieldCtx): FieldReview {
  const key = rawKey.trim();
  const attr = ctx.byKey.get(key) ?? null;
  const issues: CardIssue[] = [];
  const confidence = confidenceOf(ctx.confRaw[key] ?? ctx.confRaw[rawKey], issues, "поле");
  if (!attr) return unknownKeyField(key, rawVal, ctx, confidence, issues);
  const vc = checkValue(attr, rawVal);
  issues.push(...vc.issues);
  for (const u of vc.unknownOptions) ctx.proposals.push({ key, value: u, why: "ИИ указал значение не из списка", attr, auto: true });
  if (vc.value !== undefined) {
    const note = confidenceNote(confidence);
    if (note) issues.push(note);
  }
  const level = vc.value === undefined ? "error" : levelOf(issues);
  return {
    key,
    attr,
    label: attr.labelRu,
    raw: rawVal,
    value: vc.value,
    before: ctx.before[key],
    changed: vc.value === undefined || !sameValue(vc.value, ctx.before[key]),
    confidence,
    src: sourceOf(ctx.srcRaw, key),
    issues,
    level,
    preselect: level !== "error" && (confidence === null || confidence >= 40),
  };
}

/** Поля из `specs` ответа; `proposals` дополняется значениями не из списка опций, `issues` — замечаниями к товару. */
export function reviewFields(
  e: Entry,
  item: CardItem,
  attrs: CardAttribute[],
  targetCategory: string | null,
  proposals: Proposal[],
  issues: CardIssue[]
): FieldReview[] {
  const specsRaw = isPlainObject(e.specs) ? e.specs : {};
  if (e.specs !== undefined && !isPlainObject(e.specs)) issues.push({ level: "warn", text: "«specs» не объект — пропущено" });
  const ctx: FieldCtx = {
    byKey: new Map(attrs.map((a) => [a.key, a])),
    targetCategory,
    before: item.specs ?? {},
    confRaw: isPlainObject(e.confidence) ? e.confidence : {},
    srcRaw: e.field_sources ?? e.fieldSources,
    proposals,
  };
  const fields: FieldReview[] = [];
  for (const [rawKey, rawVal] of Object.entries(specsRaw)) {
    if (rawVal === null || rawVal === undefined || rawVal === "") continue; // "unknown" → omitted
    fields.push(reviewField(rawKey, rawVal, ctx));
  }
  // Order as in the schema, unknown keys last.
  const order = new Map(attrs.map((a, i) => [a.key, i]));
  fields.sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
  const errFields = fields.filter((f) => f.level === "error").length;
  if (errFields) issues.push({ level: "warn", text: `полей отброшено: ${errFields}` });
  return fields;
}

/** Предложения ИИ новых опций (`proposals`) — без повторов и без пустых. */
export function addAiProposals(raw: unknown, attrs: CardAttribute[], proposals: Proposal[]): void {
  if (!Array.isArray(raw)) return;
  const byKey = new Map(attrs.map((a) => [a.key, a]));
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const key = typeof o.key === "string" ? o.key.trim() : "";
    const value = typeof o.value === "string" ? o.value.trim() : typeof o.value === "number" ? String(o.value) : "";
    if (!key || !value) continue;
    if (proposals.some((x) => x.key === key && x.value.toLocaleLowerCase() === value.toLocaleLowerCase())) continue;
    proposals.push({ key, value, why: typeof o.why === "string" ? o.why : null, attr: byKey.get(key) ?? null });
  }
}

// ---- texts -----------------------------------------------------------------

/** Название, описание и причина уценки в ru·uk·en — только то, что ответ действительно меняет или переводит. */
export function reviewTexts(e: Entry, item: CardItem, validSpecs: Record<string, unknown>): Partial<Record<TextField, TextReview>> {
  const texts: Partial<Record<TextField, TextReview>> = {};
  const current: Record<TextField, string> = {
    title: (item.title ?? "").trim(),
    description: (item.description ?? "").replace(/\r\n?/g, "\n").trim(),
    conditionNote: (item.conditionNote ?? "").trim(),
  };
  const rawTexts: Record<TextField, unknown> = { title: e.title, description: e.description, conditionNote: e.conditionNote ?? e.condition_note };
  for (const field of TEXT_FIELDS) {
    const lt = langTexts(rawTexts[field]);
    if (!lt) continue;
    if (field === "conditionNote" && !current.conditionNote) continue; // nothing to translate
    const draft: TextReview = {
      field,
      from: current[field],
      ru: field === "conditionNote" ? current.conditionNote : lt.ru ?? current[field],
      uk: lt.uk ?? "",
      en: lt.en ?? "",
      aiRu: lt.ru ?? current[field],
      changed: false,
      issues: { ru: [], uk: [], en: [] },
      level: "ok",
    };
    const checked = checkText(draft, item, validSpecs);
    if (!checked.changed && !checked.uk && !checked.en) continue;
    texts[field] = checked;
  }
  return texts;
}

// ---- the rest --------------------------------------------------------------

export function stringList(v: unknown): string[] {
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? String((x as Record<string, unknown>).url ?? "") : ""))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Непустая строка без пробелов по краям или null. */
export function trimmedOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
