/**
 * Вариант каждой строки нового товара. Слово админа (или ИИ) главнее. Строки одного нового товара без него:
 * одна и та же позиция накладной дважды — без варианта, складываются; разные позиции (Soft и Xsoft, обычная и тубус) —
 * каждая получает слова, которыми отличается от остальных (из английской строки, иначе из текста документа):
 * «Xsoft gift tube packaging». Так строки одного товара не блокируют приём — админ лишь переименует неуклюжий вариант.
 * Та же логика, что SupplyVariants.java. Чистая логика.
 */
import { sourceKey } from "./normalize";
import type { ReviewRow } from "./types";

const SPLIT = /[\s,;/()]+/;

const draftKeyOf = (r: ReviewRow) => (r.decision.kind === "new" ? r.decision.draft.title.trim().toLowerCase() : "");
const keyOf = (r: ReviewRow) => sourceKey(r.line.text, r.line.variant);

function explicit(r: ReviewRow): string | null {
  const v = r.decision.kind === "new" ? r.decision.draft.variant : null;
  return v && v.trim() ? v.trim() : null;
}

function wordsOf(r: ReviewRow): string[] {
  const l = r.line;
  const base = l.en && l.en.trim() ? l.en : l.text + (l.variant == null ? "" : ` ${l.variant}`);
  return base.trim().split(SPLIT).filter(Boolean);
}

/** Слова (в нижнем регистре), которые есть у всех строк товара. */
function common(group: ReviewRow[]): Set<string> {
  let out: Set<string> | null = null;
  for (const r of group) {
    const mine = new Set(wordsOf(r).map((w) => w.toLowerCase()));
    out = out == null ? mine : new Set([...out].filter((w) => mine.has(w)));
  }
  return out ?? new Set();
}

function distinct(r: ReviewRow, shared: Set<string>): string {
  const seen = new Set<string>();
  const own = wordsOf(r).filter((w) => {
    const low = w.toLowerCase();
    if (shared.has(low) || seen.has(low)) return false;
    seen.add(low);
    return true;
  });
  if (own.length) return own.join(" ");
  return r.line.variant && r.line.variant.trim() ? r.line.variant.trim() : r.line.id;
}

function group(g: ReviewRow[], out: Map<string, string>) {
  const derive = new Set(g.map(keyOf)).size > 1;
  const shared = derive ? common(g) : new Set<string>();
  const owner = new Map<string, string>();
  const byKey = new Map<string, string>();
  for (const r of g) {
    const own = explicit(r);
    if (own == null) continue;
    out.set(r.line.id, own);
    if (!owner.has(own.toLowerCase())) owner.set(own.toLowerCase(), keyOf(r));
    if (!byKey.has(keyOf(r))) byKey.set(keyOf(r), own);
  }
  for (const r of g) {
    if (explicit(r) != null) continue;
    const same = byKey.get(keyOf(r));
    if (same != null) {
      out.set(r.line.id, same); // та же позиция, что строка, которую админ назвал
      continue;
    }
    if (!derive) continue;
    let name = distinct(r, shared);
    const taken = owner.get(name.toLowerCase());
    if (taken == null) owner.set(name.toLowerCase(), keyOf(r));
    else if (taken !== keyOf(r)) name = `${name} ${r.line.id}`;
    out.set(r.line.id, name);
  }
}

/** id строки → её вариант (нет ключа — без варианта). Только строки с решением «new». */
export function lineVariants(rows: ReviewRow[]): Map<string, string> {
  const groups = new Map<string, ReviewRow[]>();
  for (const r of rows) {
    if (r.decision.kind !== "new") continue;
    const k = draftKeyOf(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out = new Map<string, string>();
  for (const g of groups.values()) group(g, out);
  return out;
}
