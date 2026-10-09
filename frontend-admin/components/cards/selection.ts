/**
 * What the admin chose to apply from a reviewed product (step 3 / the completion modal) and the
 * import item built from it. Shared by «Оформление с ИИ» and CardCompletionModal.
 */
import { finalRu, TEXT_FIELDS, type ProductReview, type TextReview } from "@/lib/card-check";
import type { CardImportItem, CardTextTranslations } from "@/lib/cards-api";

export interface ProductSel {
  on: boolean;
  fields: Set<string>;
  /** Accept the new Russian title. */
  title: boolean;
  description: boolean;
  category: boolean;
  brand: boolean;
  /** Save uk/en of the final Russian texts. */
  translations: boolean;
}

/**
 * A new title is accepted by default only for products nobody has seen yet (just created / hidden
 * drafts); renaming a product already on the storefront is the admin's explicit choice.
 */
export function renameByDefault(r: ProductReview, created = false): boolean {
  return created || ((r.item.cardStatus ?? "DRAFT") === "DRAFT" && r.item.active === false);
}

export function defaultSel(r: ProductReview, opts: { created?: boolean } = {}): ProductSel {
  const t = r.texts.title;
  const d = r.texts.description;
  return {
    on: r.level !== "error",
    fields: new Set(r.fields.filter((f) => f.preselect).map((f) => f.key)),
    title: !!t?.changed && !t.issues.ru.some((i) => i.level === "error") && renameByDefault(r, opts.created),
    description: !!d?.changed && !d.issues.ru.some((i) => i.level === "error"),
    category: !!r.category?.valid,
    brand: !!r.brand?.valid,
    translations: true,
  };
}

/** Keeps the admin's choice after a re-check, letting newly valid fields in. */
export function mergeSel(old: ProductSel | undefined, r: ProductReview, opts: { created?: boolean } = {}): ProductSel {
  const def = defaultSel(r, opts);
  if (!old) return def;
  const valid = (k: string) => r.fields.some((f) => f.key === k && f.value !== undefined);
  return { ...old, fields: new Set([...old.fields, ...def.fields].filter(valid)) };
}

/** Overall confidence from which a card goes straight to «Готово» (READY) on import. */
export const AUTO_READY_OVERALL = 80;
/** A field below this confidence is a guess («red») — such a card goes to «Проверить». */
export const RED_FIELD = 40;

/**
 * Should the import mark this card READY right away? Only when the AI is sure about the card
 * (overall ≥ 80) and none of the fields being saved is a guess (< 40 %); otherwise it goes to
 * «Проверить» (AI_FILLED) for the admin's eyes.
 */
export function autoReady(r: ProductReview, s: ProductSel | undefined): boolean {
  if (!s?.on || r.level === "error" || (r.overall ?? 0) < AUTO_READY_OVERALL) return false;
  return !r.fields.some((f) => s.fields.has(f.key) && f.value !== undefined && f.confidence != null && f.confidence < RED_FIELD);
}

const ruOk = (t: TextReview) => !t.issues.ru.some((i) => i.level === "error");

/** Is the Russian text of this field going to be what the translations translate? */
export function ruAccepted(t: TextReview, s: ProductSel): boolean {
  if (t.field === "conditionNote" || !t.changed) return true;
  return (t.field === "title" ? s.title : s.description) && ruOk(t);
}

/** Translation of one language is saved: present, no errors, and made for the final ru. */
export function translationSendable(t: TextReview, lang: "uk" | "en", s: ProductSel): boolean {
  return s.translations && !!t[lang].trim() && !!finalRu(t).trim() && ruAccepted(t, s) && !t.issues[lang].some((i) => i.level === "error");
}

/** null = nothing to send for this product. */
export function buildImportItem(
  r: ProductReview,
  s: ProductSel | undefined,
  opts: { markReady: boolean; model?: string; publish?: boolean }
): CardImportItem | null {
  if (!s?.on || r.level === "error") return null;
  const specs: Record<string, unknown> = {};
  const confidence: Record<string, number> = {};
  const fieldSources: Record<string, string> = {};
  for (const f of r.fields) {
    if (f.value === undefined || !s.fields.has(f.key)) continue;
    specs[f.key] = f.value;
    if (f.confidence != null) confidence[f.key] = f.confidence;
    if (f.src) fieldSources[f.key] = f.src;
  }
  const item: CardImportItem = { productId: r.item.id, specs, confidence, markReady: opts.markReady };
  if (Object.keys(fieldSources).length) item.fieldSources = fieldSources;
  if (opts.publish !== undefined) item.publish = opts.publish;
  if (r.overall != null) item.overall = r.overall;
  if (s.category && r.category?.valid) item.categorySlug = r.category.to;
  if (s.brand && r.brand?.valid) item.brand = r.brand.to;
  const title = r.texts.title;
  if (title?.changed && s.title && ruOk(title)) item.title = title.ru.trim();
  const desc = r.texts.description;
  if (desc?.changed && s.description && ruOk(desc)) item.description = desc.ru.trim();

  const translations: Partial<Record<"uk" | "en", CardTextTranslations>> = {};
  for (const lang of ["uk", "en"] as const) {
    const out: CardTextTranslations = {};
    for (const field of TEXT_FIELDS) {
      const t = r.texts[field];
      if (t && translationSendable(t, lang, s)) out[field] = t[lang].trim();
    }
    if (Object.keys(out).length) translations[lang] = out;
  }
  if (Object.keys(translations).length) item.translations = translations;

  if (r.sources.length) item.sources = r.sources;
  if (r.notes) item.notes = r.notes;
  const m = r.model ?? opts.model?.trim();
  if (m) item.model = m;
  const any =
    Object.keys(specs).length || item.categorySlug || item.brand || item.title || item.description || item.translations || opts.markReady || opts.publish;
  return any ? item : null;
}
