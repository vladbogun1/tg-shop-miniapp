/**
 * «Карточки» ↔ встроенный ИИ: адаптер между разбором ответа (`ProductReview`) и общим экраном проверки
 * `features/ai` (`ReviewField[]`). Здесь: отпечаток карточки (версия предмета задачи), перевод разбора в строки
 * с замком/конфликтом (снимок на старте и правки после него — с сервера, `ai-conflict.ts`)/правдоподобием, сборка выбора для записи тем же путём, что у ручного
 * мастера (`buildImportItem` → `cardsApi.import`, метка ИИ — в `card_meta`). Чистая логика.
 */
import { conflictText, conflictWithoutSnapshot, plausibility, plausibilityReason, type ReviewField } from "@/features/ai";
import type { CardChanges } from "./ai-conflict";
import type { CardItem } from "./item";
import { metaOf } from "./view";
import { editSpec, editText } from "./review";
import { defaultSel, renameByDefault, type ProductSel } from "./selection";
import { formatValue } from "./value";
import type { FieldReview, ProductReview } from "./types";

/** Версия текста запроса: меняется при правке промпта, сохраняется в задаче. */
export const CARD_PROMPT_VERSION = "card-v1";

const SPEC = "spec:";
const specKey = (key: string) => `${SPEC}${key}`;

function stableText(v: unknown): string {
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  }
  return JSON.stringify(v ?? null);
}

/** Значения полей карточки как строки (ключ строки ревью → значение; null — пусто). Основа отпечатка. */
export function valuesOf(item: CardItem): Record<string, string | null> {
  const out: Record<string, string | null> = {
    title: item.title?.trim() || null,
    description: item.description?.trim() || null,
    category: item.categorySlug ?? null,
    brand: item.brand?.trim() || null,
  };
  for (const [k, v] of Object.entries(item.specs ?? {})) {
    if (v !== null && v !== undefined && v !== "") out[specKey(k)] = stableText(v);
  }
  return out;
}

/** Короткий отпечаток карточки (djb2 по значениям и журналу): «версия предмета» задачи. */
export function cardVersion(item: CardItem): string {
  const meta = metaOf(item);
  const values = Object.entries(valuesOf(item)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const text = JSON.stringify([values, meta.importedAt ?? null, meta.reviewedAt ?? null]);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `v1-${(h >>> 0).toString(36)}`;
}

export interface FieldContext {
  /** Правки после старта по снимку на сервере; null — у задачи снимка нет (поставлена до V92). */
  changes: CardChanges | null;
  /** Отпечаток карточки другой, чем при старте: без снимка — единственный признак правок. */
  versionChanged: boolean;
  /** Значения числовой характеристики у других товаров той же категории. */
  neighbors: (specKeyName: string) => number[];
  /** Ключи строк, которые человек поправил в ревью (`editReviewValue`). */
  edited?: ReadonlySet<string>;
}

type Doubt = Pick<ReviewField, "suspicion" | "reason">;

function conflictOf(ctx: FieldContext, key: string, label: string, proposed: string, nowValue: string | null): string | null {
  if (ctx.changes) return conflictText(label, proposed, { change: ctx.changes.fields[key] ?? null, editors: ctx.changes.editors });
  return conflictWithoutSnapshot(nowValue, ctx.versionChanged);
}

function doubtOf(f: FieldReview, neighbors: number[]): Doubt {
  if (typeof f.value === "number") {
    const p = plausibility(f.value, neighbors);
    if (p !== "ok") return { suspicion: p, reason: plausibilityReason(f.value, neighbors) };
  }
  const issue = f.issues.find((i) => i.level === "warn");
  if (issue) return { suspicion: "warn", reason: issue.text };
  if (f.confidence !== null && f.confidence < 40) return { suspicion: "warn", reason: "ИИ не уверен в этом значении" };
  return { suspicion: "none", reason: null };
}

/** Значение есть, а метки ИИ в журнале нет — его вписал человек (или оно из старой загрузки): ИИ его не трогает. */
function lockOf(item: CardItem, key: string, hasBefore: boolean): Pick<ReviewField, "humanLocked" | "lockNote"> {
  if (hasBefore && !metaOf(item).fields?.[key]) return { humanLocked: true, lockNote: "Заполнено вручную — ИИ не заменяет такие значения" };
  return { humanLocked: false, lockNote: null };
}

function specRows(r: ProductReview, ctx: FieldContext): ReviewField[] {
  const rows: ReviewField[] = [];
  const now = valuesOf(r.item);
  for (const f of r.fields) {
    if (f.value === undefined || !f.changed) continue;
    const key = specKey(f.key);
    const hasBefore = f.before !== null && f.before !== undefined && f.before !== "";
    const proposed = formatValue(f.attr ?? undefined, f.value);
    rows.push({
      key,
      label: f.label,
      before: hasBefore ? formatValue(f.attr ?? undefined, f.before) : null,
      after: proposed,
      confidence: f.confidence,
      source: f.src,
      ...doubtOf(f, ctx.neighbors(f.key)),
      ...lockOf(r.item, f.key, hasBefore),
      conflict: conflictOf(ctx, key, f.label, proposed, now[key] ?? null),
      ...(f.attr ? { editable: "line" as const } : {}),
      edited: ctx.edited?.has(key) ?? false,
    });
  }
  return rows;
}

function textRows(r: ProductReview, ctx: FieldContext): ReviewField[] {
  const rows: ReviewField[] = [];
  const now = valuesOf(r.item);
  const defs = [
    ["title", "Название"],
    ["description", "Описание"],
  ] as const;
  for (const [field, label] of defs) {
    const t = r.texts[field];
    if (!t || !t.changed) continue;
    const error = t.issues.ru.find((i) => i.level === "error");
    rows.push({
      key: field,
      label,
      before: t.from.trim() || null,
      after: t.ru.trim(),
      confidence: r.overall,
      source: null,
      suspicion: error ? "bad" : "none",
      reason: error?.text ?? null,
      humanLocked: false,
      lockNote: null,
      conflict: conflictOf(ctx, field, label, t.ru.trim(), now[field] ?? null),
      editable: field === "description" ? "text" : "line",
      edited: ctx.edited?.has(field) ?? false,
    });
  }
  return rows;
}

function changeRows(r: ProductReview, ctx: FieldContext): ReviewField[] {
  const rows: ReviewField[] = [];
  const now = valuesOf(r.item);
  const defs = [
    ["category", "Категория", r.category],
    ["brand", "Бренд", r.brand],
  ] as const;
  for (const [key, label, c] of defs) {
    if (!c) continue;
    rows.push({
      key,
      label,
      before: c.from,
      after: c.to,
      confidence: r.overall,
      source: null,
      suspicion: c.valid ? "none" : "bad",
      reason: c.valid ? null : c.issues.find((i) => i.level !== "info")?.text ?? "Такой категории нет в каталоге",
      humanLocked: false,
      lockNote: null,
      conflict: conflictOf(ctx, key, label, c.to, now[key] ?? null),
    });
  }
  return rows;
}

/** Разбор ответа → строки экрана проверки (категория, бренд, характеристики, тексты). */
export function reviewRows(r: ProductReview, ctx: FieldContext): ReviewField[] {
  return [...changeRows(r, ctx), ...specRows(r, ctx), ...textRows(r, ctx)];
}

/**
 * Что включено сверх «Заполнит пустое»: новое название у только что созданного товара — как у ручного пути
 * (`renameByDefault`).
 */
export function extraInitialKeys(r: ProductReview, rows: ReviewField[], created: boolean): string[] {
  const title = rows.find((x) => x.key === "title");
  return title && renameByDefault(r, created) && title.suspicion === "none" && !title.conflict ? ["title"] : [];
}

/**
 * Правка значения строки ревью человеком: название и описание — как правка текста у ручного пути (`editText`,
 * переводы uk/en после неё сохраняются только если сделаны для итогового русского), характеристика — `editSpec`.
 */
export function editReviewValue(r: ProductReview, key: string, value: string): { review: ProductReview; error: string | null } {
  if (key === "title" || key === "description") {
    if (!value.trim()) return { review: r, error: "Пустым оставить нельзя" };
    return { review: editText(r, key, "ru", value), error: null };
  }
  if (key.startsWith(SPEC)) return editSpec(r, key.slice(SPEC.length), value);
  return { review: r, error: "Это поле здесь не правится" };
}

/** Выбор на экране → выбор записи тем же `buildImportItem`, что у ручного пути; фото — отмеченные в ревью. */
export function toProductSel(r: ProductReview, keys: ReadonlySet<string>, opts: { translations: boolean; photos?: string[] }): ProductSel {
  return {
    ...defaultSel(r),
    on: true,
    fields: new Set([...keys].filter((k) => k.startsWith(SPEC)).map((k) => k.slice(SPEC.length))),
    title: keys.has("title"),
    description: keys.has("description"),
    category: keys.has("category"),
    brand: keys.has("brand"),
    translations: opts.translations,
    photos: opts.photos ?? [],
  };
}
