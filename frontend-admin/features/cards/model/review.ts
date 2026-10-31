/**
 * «Карточки»: проверка ответа ИИ по товарам — запись товара из ответа → `ProductReview` (что изменится, что не так,
 * что предложено), правка текста на месте и сопоставление id ответа с товарами. Чистая логика.
 */
import type { CardItem } from "./item";
import { confidenceOf, levelOf } from "./level";
import type { ParsedCardAnswer } from "./parse";
import {
  addAiProposals,
  reviewBrand,
  reviewCategory,
  reviewFields,
  reviewTexts,
  stringList,
  trimmedOrNull,
  validSpecsOf,
  type Entry,
} from "./review-parts";
import { attributesForCategory, type CardSchema } from "./schema";
import { checkText } from "./text";
import type { CardIssue, CardReview, Level, ProductReview, Proposal, TextField, TextLang, TextReview } from "./types";

/** Product level from all its parts (after the answer or an inline text edit). */
export function productLevel(r: Omit<ProductReview, "level">): Level {
  const texts = Object.values(r.texts) as TextReview[];
  const usable =
    r.fields.some((f) => f.level !== "error") ||
    texts.some((t) => t.changed || !!t.uk.trim() || !!t.en.trim()) ||
    !!r.category?.valid ||
    !!r.brand;
  if (!usable || r.issues.some((i) => i.level === "error")) return "error";
  const all = [
    ...r.issues,
    ...(r.category?.issues.filter((i) => i.level !== "error") ?? []),
    ...(r.category && !r.category.valid ? [{ level: "warn" as const, text: "" }] : []),
    ...(r.brand?.issues ?? []),
    ...(r.fields.some((f) => f.level === "warn") ? [{ level: "warn" as const, text: "" }] : []),
    // A broken text or translation is simply not saved — the product stays sendable.
    ...(texts.some((t) => t.level !== "ok") ? [{ level: "warn" as const, text: "" }] : []),
  ];
  return levelOf(all);
}

/** Inline edit of one language of one text. */
export function editText(r: ProductReview, field: TextField, lang: TextLang, value: string): ProductReview {
  const t = r.texts[field];
  if (!t) return r;
  const next = checkText({ ...t, [lang]: value }, r.item, validSpecsOf(r.fields));
  const out = { ...r, texts: { ...r.texts, [field]: next } };
  return { ...out, level: productLevel(out) };
}

export interface ReviewContext {
  schema: CardSchema;
  /** Every product the screen knows (ids must match `assignCardIds` over the same set). */
  items: CardItem[];
  /** UUID → answer id. */
  ids: Map<string, string>;
}

/** Answer id → product; tolerant to a lost "p", a full UUID or a prefix the AI shortened/extended. */
function resolveId(id: string, byPid: Map<string, CardItem>, items: CardItem[]): CardItem | null {
  const direct = byPid.get(id);
  if (direct) return direct;
  const hex = id.replace(/^p/, "").replace(/-/g, "");
  if (!/^[0-9a-f]{6,32}$/.test(hex)) return null;
  const hits = items.filter((it) => {
    const h = it.id.replace(/-/g, "").toLowerCase();
    return h.startsWith(hex) || hex.startsWith(h.slice(0, Math.max(8, hex.length)));
  });
  return hits.length === 1 ? hits[0] : null;
}

/** Общая уверенность ИИ в карточке: замечания к товару. */
function overallOf(e: Entry, issues: CardIssue[]): number | null {
  const overall = confidenceOf(e.overall, issues, "общая");
  if (overall === null) issues.push({ level: "warn", text: "нет общей уверенности" });
  else if (overall < 60) issues.push({ level: "warn", text: `общая уверенность ${overall} %` });
  return overall;
}

export function reviewProduct(id: string, item: CardItem, raw: unknown, schema: CardSchema): ProductReview | { problems: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { problems: ["значение не объект { specs, confidence, … }"] };
  const e = raw as Entry;
  const issues: CardIssue[] = [];
  const { category, targetCategory } = reviewCategory(e, item, schema);
  const brand = reviewBrand(e, item);
  const attrs = attributesForCategory(schema, targetCategory);
  const proposals: Proposal[] = [];
  const fields = reviewFields(e, item, attrs, targetCategory, proposals, issues);
  addAiProposals(e.proposals, attrs, proposals);
  if (proposals.length) issues.push({ level: "warn", text: `предложений новых опций: ${proposals.length}` });
  const texts = reviewTexts(e, item, validSpecsOf(fields));
  const overall = overallOf(e, issues);

  const r: Omit<ProductReview, "level"> = {
    id,
    item,
    issues,
    category,
    brand,
    targetCategory,
    fields,
    texts,
    overall,
    sources: stringList(e.sources).filter((s) => /^https?:\/\//i.test(s)),
    notes: trimmedOrNull(e.notes),
    proposals,
    model: trimmedOrNull(e.model),
  };
  const level = productLevel(r);
  if (level === "error" && !issues.some((i) => i.level === "error")) {
    issues.push({ level: "error", text: "нечего применить: нет ни одного корректного поля или текста" });
  }
  return { ...r, level };
}

export function buildCardReview(parsed: ParsedCardAnswer, ctx: ReviewContext): CardReview {
  const byPid = new Map<string, CardItem>();
  for (const it of ctx.items) {
    const pid = ctx.ids.get(it.id);
    if (pid) byPid.set(pid, it);
  }
  const products: ProductReview[] = [];
  const unknown: string[] = [];
  const invalid: { id: string; problems: string[] }[] = [];
  const used = new Set<string>();
  parsed.entries.forEach((raw, id) => {
    const item = resolveId(id, byPid, ctx.items);
    if (!item) {
      unknown.push(id);
      return;
    }
    const pid = ctx.ids.get(item.id) ?? id;
    if (parsed.duplicates.has(id) || used.has(item.id)) {
      invalid.push({ id, problems: ["товар встречается в ответе несколько раз"] });
      return;
    }
    used.add(item.id);
    const r = reviewProduct(pid, item, raw, ctx.schema);
    if ("problems" in r) invalid.push({ id, problems: r.problems });
    else products.push(r);
  });
  return { products, unknown, invalid };
}
