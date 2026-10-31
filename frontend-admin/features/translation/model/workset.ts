/**
 * «Переводы»: рабочий набор — уникальные русские тексты и поля, в которых они стоят.
 * Чистые функции без React; формат ответа ИИ описан в `prompt.ts`, разбор — в `parse.ts`.
 */
import type { TrExportItem, TrLocale, TrOrigin, TrStatus } from "./types";

export const LOCALES: TrLocale[] = ["uk", "en"];

// ============================================================================
// Work set
// ============================================================================

/** One translatable field (both languages joined). */
export interface FieldRef {
  key: string;
  entityType: string;
  entityId: string;
  field: string;
  source: string;
  sourceHash: string;
  productId: string | null;
  productTitle: string | null;
  status: Record<TrLocale, TrStatus>;
  text: Record<TrLocale, string | null>;
  origin: Record<TrLocale, TrOrigin | null>;
  /** STALE: the Russian text the translation was made from (null when unknown). */
  prevSource: Record<TrLocale, string | null>;
  /** A person accepted the translation (MANUAL or «Принять»). */
  reviewed: Record<TrLocale, boolean>;
}

/** One unique Russian string = one id in the prompt, fanned out to all its fields. */
export interface UniqueString {
  id: string;
  sourceHash: string;
  source: string;
  /** `${entityType}.${field}` of the first field — what the AI is told the string is. */
  kindKey: string;
  /** Context: the product of a variant name, the category of a category SEO field. */
  product: string | null;
  fields: FieldRef[];
  /** Some field still needs this language (MISSING or STALE). */
  needs: Record<TrLocale, boolean>;
  hasMissing: boolean;
  hasStale: boolean;
}

export interface WorkSet {
  fields: FieldRef[];
  strings: UniqueString[];
  byId: Map<string, UniqueString>;
}


const TYPE_ORDER: Record<string, number> = { CATEGORY: 0, PAYMENT_OPTION: 1, REPLY_TEMPLATE: 2, BOT_TEXT: 2, PRODUCT: 3, VARIANT: 4 };
const FIELD_ORDER: Record<string, number> = {
  title: 0,
  name: 0,
  description: 1,
  seo_title: 2,
  seo_description: 3,
  h1: 4,
  intro_text: 5,
  condition_note: 6,
  purpose: 0,
  note: 1,
};

export function fieldKey(i: { entityType: string; entityId: string; field: string }): string {
  return `${i.entityType}:${i.entityId}:${i.field}`;
}

function lcp(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * id = "t" + shortest hex prefix of the source hash (min 6) that is unique among ALL current
 * sources — stable across reloads, filters and parts.
 */
export function assignIds(hashes: string[]): Map<string, string> {
  const sorted = Array.from(new Set(hashes)).sort();
  const out = new Map<string, string>();
  sorted.forEach((h, i) => {
    let len = 6;
    if (i > 0) len = Math.max(len, lcp(sorted[i - 1], h) + 1);
    if (i < sorted.length - 1) len = Math.max(len, lcp(sorted[i + 1], h) + 1);
    out.set(h, "t" + h.slice(0, len));
  });
  return out;
}

export function buildWorkSet(uk: TrExportItem[], en: TrExportItem[]): WorkSet {
  const map = new Map<string, FieldRef>();
  const add = (locale: TrLocale, it: TrExportItem) => {
    const key = fieldKey(it);
    let f = map.get(key);
    if (!f) {
      f = {
        key,
        entityType: it.entityType,
        entityId: it.entityId,
        field: it.field,
        source: it.source,
        sourceHash: it.sourceHash,
        productId: it.productId ?? null,
        productTitle: it.productTitle ?? null,
        status: { uk: "MISSING", en: "MISSING" },
        text: { uk: null, en: null },
        origin: { uk: null, en: null },
        prevSource: { uk: null, en: null },
        reviewed: { uk: false, en: false },
      };
      map.set(key, f);
    }
    f.status[locale] = it.status;
    f.text[locale] = it.text;
    f.origin[locale] = it.origin;
    f.prevSource[locale] = it.prevSource ?? null;
    f.reviewed[locale] = !!it.reviewed;
  };
  uk.forEach((i) => add("uk", i));
  en.forEach((i) => add("en", i));

  const fields = Array.from(map.values()).sort(
    (a, b) =>
      (TYPE_ORDER[a.entityType] ?? 9) - (TYPE_ORDER[b.entityType] ?? 9) ||
      (a.productTitle ?? "").localeCompare(b.productTitle ?? "", "ru") ||
      a.entityId.localeCompare(b.entityId) ||
      (FIELD_ORDER[a.field] ?? 9) - (FIELD_ORDER[b.field] ?? 9)
  );
  const ids = assignIds(fields.map((f) => f.sourceHash));
  const byHash = new Map<string, UniqueString>();
  const strings: UniqueString[] = [];
  for (const f of fields) {
    let s = byHash.get(f.sourceHash);
    if (!s) {
      s = {
        id: ids.get(f.sourceHash)!,
        sourceHash: f.sourceHash,
        source: f.source,
        kindKey: `${f.entityType}.${f.field}`,
        // Context for the AI: the product of a variant name, the category of a category SEO text.
        product:
          f.entityType === "VARIANT" || f.entityType === "REPLY_TEMPLATE" || f.entityType === "BOT_TEXT" || (f.entityType === "CATEGORY" && f.field !== "name")
            ? f.productTitle
            : null,
        fields: [],
        needs: { uk: false, en: false },
        hasMissing: false,
        hasStale: false,
      };
      byHash.set(f.sourceHash, s);
      strings.push(s);
    }
    s.fields.push(f);
    for (const l of LOCALES) {
      if (f.status[l] !== "TRANSLATED") s.needs[l] = true;
      if (f.status[l] === "MISSING") s.hasMissing = true;
      if (f.status[l] === "STALE") s.hasStale = true;
    }
  }
  return { fields, strings, byId: new Map(strings.map((s) => [s.id, s])) };
}
