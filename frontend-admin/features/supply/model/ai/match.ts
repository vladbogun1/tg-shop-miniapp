/**
 * Сопоставление строк документа с каталогом без ИИ: сначала память поставщика (точный ключ строки), потом поиск
 * по словам — бренд, код модели, цвет. Цвета у нас обычно отдельные товары («Коврик … чёрный» и «… красный»),
 * поэтому чужой цвет в названии штрафуется. Чистая логика.
 */
import { sourceKey, words } from "./normalize";
import type { Candidate, CatalogItem, LineDecision, SourceLine } from "./types";

export interface Alias {
  sourceKey: string;
  productId: string;
  variantId: string | null;
}

/** Английский цвет → основы слов, как он пишется в наших названиях и вариантах. */
const COLORS: Record<string, string[]> = {
  black: ["черн", "чорн", "black"],
  white: ["бел", "біл", "white"],
  red: ["красн", "червон", "red"],
  blue: ["син", "blue"],
  green: ["зел", "green"],
  pink: ["розов", "рожев", "pink"],
  purple: ["фиолет", "фіолет", "purple", "violet"],
  grey: ["сер", "сір", "grey", "gray"],
  teal: ["бирюз", "бірюз", "teal", "cyan", "turquoise"],
  orange: ["оранж", "помаран", "orange"],
  yellow: ["желт", "жовт", "yellow"],
  silver: ["серебр", "срібн", "silver"],
};
COLORS.gray = COLORS.grey;
COLORS.violet = COLORS.purple;
COLORS.turquoise = COLORS.teal;
COLORS.cyan = COLORS.teal;

const ALL_STEMS = Object.values(COLORS).flat();
const hasDigit = (w: string) => /\d/.test(w);
const stemIn = (stems: string[], ws: string[]) => ws.some((w) => stems.some((s) => w.startsWith(s)));

function colorStems(l: SourceLine): string[] {
  const ws = [...words(l.color), ...words(l.en), ...words(l.variant)];
  return [...new Set(ws.flatMap((w) => COLORS[w] ?? []))];
}

/** Слова строки, по которым ищем: латиница и цифры из бренда, модели, перевода, текста и варианта. */
function lineWords(l: SourceLine): string[] {
  return [...new Set([l.brand, l.model, l.en, l.text, l.variant].flatMap((x) => words(x)))];
}

/** Коды модели: слова модели (или все слова с цифрами), без размеров вроде 490 / 420 / 4mm. */
function modelWords(l: SourceLine): string[] {
  const src = l.model ? words(l.model) : lineWords(l).filter(hasDigit);
  return src.filter((w) => !/^\d{3,}$/.test(w) && !/^\d+mm$/.test(w));
}

function productScore(l: SourceLine, p: CatalogItem): number {
  const pw = [...new Set([...words(p.title), ...words(p.brand)])];
  const lw = lineWords(l);
  let score = 0;
  for (const m of modelWords(l)) {
    if (pw.includes(m)) score += hasDigit(m) ? 3 : 1.5;
    else if (hasDigit(m)) score -= 2;
  }
  // Код модели у товара, которого нет в строке (ZP2 при строке ZP1), — другой товар.
  for (const w of pw) if (hasDigit(w) && !/^\d{3,}$/.test(w) && !lw.includes(w)) score -= 1.5;
  if (l.brand && words(l.brand).every((w) => pw.includes(w))) score += 2;
  const colors = colorStems(l);
  if (colors.length) {
    const titleWords = words(p.title);
    if (stemIn(colors, titleWords)) score += 1;
    else if (stemIn(ALL_STEMS, titleWords) && p.variants.length === 0) score -= 1.5;
  }
  return score;
}

/** Вариант товара, лучше всего похожий на вариант / цвет / размер строки; null — без варианта или не угадали. */
export function pickVariant(l: SourceLine, p: CatalogItem): string | null {
  if (p.variants.length === 0) return null;
  const lw = [...words(l.variant), ...words(l.color), ...words(l.en)];
  const colors = colorStems(l);
  let best: { id: string; score: number } | null = null;
  for (const v of p.variants) {
    const vw = words(v.name);
    let s = vw.filter((w) => lw.includes(w)).length * 2;
    if (colors.length && stemIn(colors, vw)) s += 1;
    if (s > 0 && (!best || s > best.score)) best = { id: v.id, score: s };
  }
  return best?.id ?? null;
}

export function candidatesOf(l: SourceLine, catalog: CatalogItem[], limit = 8): Candidate[] {
  return catalog
    .map((p) => ({ productId: p.id, variantId: pickVariant(l, p), score: productScore(l, p) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Уверенный поиск: явный лидер, с вариантом, если они у товара есть. */
function confident(cands: Candidate[], catalog: Map<string, CatalogItem>): Candidate | null {
  const [top, second] = cands;
  if (!top || top.score < 5) return null;
  if (second && top.score - second.score < 2) return null;
  const p = catalog.get(top.productId);
  if (p && p.variants.length > 0 && !top.variantId) return null;
  return top;
}

function fromMemory(l: SourceLine, memory: Map<string, Alias>, catalog: Map<string, CatalogItem>): LineDecision | null {
  const a = memory.get(sourceKey(l.text, l.variant));
  const p = a && catalog.get(a.productId);
  if (!a || !p) return null;
  if (a.variantId ? !p.variants.some((v) => v.id === a.variantId) : p.variants.length > 0) return null;
  return { kind: "match", productId: a.productId, variantId: a.variantId, by: "memory" };
}

/** Начальное решение по строке и кандидаты для подсказки / шага 2. */
export function autoMatch(
  l: SourceLine,
  catalog: CatalogItem[],
  memory: Alias[],
): { decision: LineDecision; candidates: Candidate[] } {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const mem = new Map(memory.map((a) => [a.sourceKey, a]));
  const candidates = candidatesOf(l, catalog);
  const remembered = fromMemory(l, mem, byId);
  if (remembered) return { decision: remembered, candidates };
  const top = confident(candidates, byId);
  if (top) return { decision: { kind: "match", productId: top.productId, variantId: top.variantId, by: "search" }, candidates };
  return { decision: { kind: "open" }, candidates };
}
