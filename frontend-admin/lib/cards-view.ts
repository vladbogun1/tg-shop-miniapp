/**
 * «Карточки» list logic (docs/CATALOG-SPECS.md §5): one screen, three tabs by the card status —
 *   «Оформить»  — DRAFT (new hidden products first, then on the storefront, then old hidden ones);
 *   «Проверить» — AI_FILLED, hidden ones too (least sure first);
 *   «Готово»    — READY (last reviewed first), with «только неполные».
 * The storefront filter applies to every tab. By default («в работе») old hidden products are left out:
 * ~180 retired products are DRAFT forever and would bury the real work (and the nav badge).
 */
import { attributesForCategory, type CardItem, type CardSchema } from "@/lib/card-prompt";
import type { CardMeta } from "@/lib/cards-api";

export type CardTab = "draft" | "review" | "ready";
export type Vitrine = "work" | "all" | "live" | "hidden";

export const TAB_LABEL: Record<CardTab, string> = { draft: "Оформить", review: "Проверить", ready: "Готово" };

/** «Принять выбранные» without opening each card: only this sure and nothing required missing. */
export const BULK_ACCEPT_MIN = 90;

export function tabOf(i: CardItem): CardTab {
  const st = (i.cardStatus ?? "DRAFT").toString().toUpperCase();
  return st === "READY" ? "ready" : st === "AI_FILLED" ? "review" : "draft";
}

export function matchesVitrine(i: CardItem, v: Vitrine): boolean {
  if (v === "all") return true;
  if (v === "work") return i.active === true || i.unfinished === true;
  return v === "live" ? i.active === true : i.active !== true;
}

export function missingCount(i: CardItem): number {
  return i.missingRequired?.length ?? 0;
}

export function metaOf(i: CardItem): CardMeta {
  return (i.cardMeta ?? {}) as CardMeta;
}

export function matchesQuery(i: CardItem, q: string): boolean {
  const s = q.trim().toLocaleLowerCase("ru");
  return !s || `${i.title} ${i.brand ?? ""} ${i.categorySlug ?? ""}`.toLocaleLowerCase("ru").includes(s);
}

const time = (iso: unknown) => (typeof iso === "string" ? Date.parse(iso) || 0 : 0);

/** Order inside a tab: what needs the admin first. */
export function sortForTab(list: CardItem[], tab: CardTab): CardItem[] {
  const byTitle = (a: CardItem, b: CardItem) => a.title.localeCompare(b.title, "ru");
  const rank = (i: CardItem) => (i.unfinished === true ? 0 : i.active === true ? 1 : 2);
  const out = [...list];
  if (tab === "draft") out.sort((a, b) => rank(a) - rank(b) || byTitle(a, b));
  else if (tab === "review") out.sort((a, b) => (a.cardConfidence ?? -1) - (b.cardConfidence ?? -1) || rank(a) - rank(b) || byTitle(a, b));
  else out.sort((a, b) => time(metaOf(b).reviewedAt) - time(metaOf(a).reviewedAt) || byTitle(a, b));
  return out;
}

/** Can a card be accepted in bulk (no panel)? AI-filled, sure (≥ 90 %), nothing required missing. */
export function bulkAcceptable(i: CardItem): boolean {
  return tabOf(i) === "review" && (i.cardConfidence ?? 0) >= BULK_ACCEPT_MIN && missingCount(i) === 0;
}

/** Russian names of the missing required characteristics (keys when the schema does not know them). */
export function missingLabels(schema: CardSchema | undefined, i: CardItem): string[] {
  const keys = i.missingRequired ?? [];
  if (!schema) return keys;
  const attrs = attributesForCategory(schema, i.categorySlug);
  return keys.map((k) => attrs.find((a) => a.key === k)?.labelRu ?? k);
}

/** «нет 3 полей» — Russian plural of «поле». */
export function fieldsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "поля"; // «нет 1 поля», «нет 21 поля»
  return "полей";
}

export function productsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "товар";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "товара";
  return "товаров";
}

export function cardsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "карточку";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "карточки";
  return "карточек";
}
