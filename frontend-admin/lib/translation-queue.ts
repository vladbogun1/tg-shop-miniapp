/**
 * «Переводы»: the task buckets of the screen. Pure functions over the work set (translation-check.ts).
 *
 * The unit is a unique Russian text (a description shared by 20 products is one row, as in the AI
 * prompt). Every text is in exactly one bucket — the first that matches over the chosen languages:
 *   missing (no translation in some language) → stale (the original changed since) →
 *   review (AI translation nobody accepted) → done.
 * The backend counts the same buckets for the nav badge (`stats.texts`).
 */
import type { TrAcceptItem, TrImportItem, TrLocale } from "@/lib/api";
import { LOCALES, type FieldRef, type UniqueString } from "@/lib/translation-check";

export type Bucket = "missing" | "stale" | "review" | "done";
export const BUCKETS: Bucket[] = ["missing", "stale", "review", "done"];
const RANK: Record<Bucket, number> = { missing: 0, stale: 1, review: 2, done: 3 };

export const BUCKET_LABEL: Record<Bucket, string> = {
  missing: "Нужно перевести",
  stale: "Устарели",
  review: "Проверить ИИ",
  done: "Готово",
};

/** State of one language of one field / text, in the words of the screen. */
export const STATE_LABEL: Record<Bucket, string> = {
  missing: "нет перевода",
  stale: "устарел",
  review: "ИИ, не проверен",
  done: "готово",
};

export type LangScope = "all" | TrLocale;

export function langsOf(scope: LangScope): TrLocale[] {
  return scope === "all" ? LOCALES : [scope];
}

export function fieldState(f: FieldRef, l: TrLocale): Bucket {
  if (f.status[l] === "MISSING") return "missing";
  if (f.status[l] === "STALE") return "stale";
  return f.reviewed[l] ? "done" : "review";
}

function worst(a: Bucket, b: Bucket): Bucket {
  return RANK[a] <= RANK[b] ? a : b;
}

/** Worst state of a language over every field holding the text. */
export function langState(s: UniqueString, l: TrLocale): Bucket {
  let st: Bucket = "done";
  for (const f of s.fields) st = worst(st, fieldState(f, l));
  return st;
}

export function bucketOf(s: UniqueString, langs: TrLocale[]): Bucket {
  let st: Bucket = "done";
  for (const l of langs) st = worst(st, langState(s, l));
  return st;
}

/** The text shown for a language: a current translation first, else the outdated one. */
export function currentText(s: UniqueString, l: TrLocale): string {
  const current = s.fields.find((f) => f.status[l] === "TRANSLATED" && f.text[l]);
  if (current) return current.text[l]!;
  return s.fields.find((f) => f.text[l])?.text[l] ?? "";
}

/** The Russian text an outdated translation was made from, when the backend knows it. */
export function prevSourceOf(s: UniqueString, langs: TrLocale[]): string | null {
  for (const l of langs) {
    for (const f of s.fields) {
      if (f.status[l] === "STALE" && f.prevSource[l] && f.prevSource[l] !== s.source) return f.prevSource[l];
    }
  }
  return null;
}

/** Translations of this language made by hand that are now outdated (an AI import would replace them). */
export function staleManual(s: UniqueString, l: TrLocale): FieldRef[] {
  return s.fields.filter((f) => f.status[l] === "STALE" && f.origin[l] === "MANUAL");
}

// ---- type filter ------------------------------------------------------------

export type TypeFilter = "" | "PRODUCT" | "CATEGORY" | "PAYMENT_OPTION" | "REPLY_TEMPLATE";

export const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "", label: "Все тексты" },
  { value: "PRODUCT", label: "Товары и варианты" },
  { value: "CATEGORY", label: "Категории" },
  { value: "PAYMENT_OPTION", label: "Способы оплаты" },
  { value: "REPLY_TEMPLATE", label: "Шаблоны чата" },
];

export function matchesType(s: UniqueString, t: TypeFilter): boolean {
  if (!t) return true;
  return s.fields.some((f) => (t === "PRODUCT" ? f.entityType === "PRODUCT" || f.entityType === "VARIANT" : f.entityType === t));
}

/** Where the text is used, for people: «Товар «X»», «Категория «Y»», «Шаблон чата «Z»». */
export function placeOf(f: FieldRef): string {
  switch (f.entityType) {
    case "PRODUCT":
    case "VARIANT":
      return f.productTitle ? `«${f.productTitle}»` : "товар";
    case "CATEGORY":
      return f.productTitle ? `Категория «${f.productTitle}»` : "Категория";
    case "REPLY_TEMPLATE":
      return `Шаблон чата «${f.productTitle ?? ""}»`;
    default:
      return "Способ оплаты";
  }
}

export function matchesSearch(s: UniqueString, needle: string): boolean {
  if (!needle) return true;
  if (s.source.toLowerCase().includes(needle)) return true;
  return s.fields.some(
    (f) =>
      (f.productTitle ?? "").toLowerCase().includes(needle) ||
      (f.text.uk ?? "").toLowerCase().includes(needle) ||
      (f.text.en ?? "").toLowerCase().includes(needle)
  );
}

// ---- writes -------------------------------------------------------------------

export interface LangPlan {
  /** Fields that get the text written (no translation yet, or a different text). */
  write: TrImportItem[];
  /** Fields whose existing translation is confirmed as is. */
  accept: TrAcceptItem[];
}

/**
 * What «Принять» does for one language with the final `text`: fields that lack it get it written,
 * fields that already hold exactly it are accepted (an outdated one is re-bound to the current
 * original — «перевод всё ещё верен»).
 */
export function planAccept(s: UniqueString, l: TrLocale, text: string): LangPlan {
  const write: TrImportItem[] = [];
  const accept: TrAcceptItem[] = [];
  for (const f of s.fields) {
    const ref = { entityType: f.entityType, entityId: f.entityId, field: f.field, sourceHash: f.sourceHash };
    if (f.text[l] === text && f.status[l] !== "MISSING") {
      if (fieldState(f, l) !== "done") accept.push({ ...ref, locale: l });
    } else {
      write.push({ ...ref, text });
    }
  }
  return { write, accept };
}
