/**
 * Шаг 2 «Поставки с ИИ»: строки, которые поиск не нашёл уверенно, весь каталог (без архива, скрытые помечены) и
 * подсказка поиска к каждой строке. ИИ решает: это товар каталога, «одно из этих — по накладной не понять какое»
 * (строка остаётся нерешённой с коротким списком ИИ) или новый товар. Каталог стоит до строк: эта часть промпта у всех
 * черновиков одна и та же и попадает в кэш модели. Ответ разбирает `parseMatch` ниже. Тот же текст и логика, что
 * MatchPrompt.java на сервере (golden-файл из этой сборки сверяет SupplyPromptsInSyncTest).
 */
import { extractJson } from "./json";
import type { CatalogItem, LineDecision, NewProductDraft, ReviewRow } from "./types";

export interface LeafCategory {
  id: string;
  slug: string;
  name: string;
}

/** Версия промпта шага 2 — в задаче встроенного ИИ, чтобы метрики отличали правки текста. */
export const MATCH_PROMPT_VERSION = "supply-match-2";

/**
 * Предмет задачи встроенного ИИ: набор нерешённых строк (номер + текст + вариант). Тот же набор второй раз — «уже идёт»,
 * а не вторая платная задача. FNV-1a 32 бита ×2 с разными затравками: 16 hex-знаков хватает для ключа «одна поставка».
 */
export function matchSubject(rows: ReviewRow[]): string {
  const text = rows.map((r) => [r.line.id, r.line.text, r.line.variant ?? ""].join("|")).join(";");
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return `m${fnv(0x811c9dc5)}${fnv(0x9747b28c)}`;
}

/** Короткий ключ товара в промпте: "p" + первые 8 знаков id. */
export const shortId = (id: string) => `p${id.replace(/-/g, "").slice(0, 8)}`;

/** Сравнение строк по кодовым единицам, как String.compareTo в Java (не localeCompare): порядок каталога одинаков. */
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function catalogLine(p: CatalogItem): string {
  const brandInTitle = !p.brand || p.title.toLowerCase().includes(p.brand.toLowerCase());
  const variants = p.variants.length ? ` | варианты: ${p.variants.map((v) => v.name).join(", ")}` : "";
  return `- ${shortId(p.id)} | ${p.title}${brandInTitle ? "" : ` | ${p.brand}`}${variants}${p.hidden ? " | скрыт" : ""}`;
}

/** Товары по конечным категориям в порядке дерева, внутри — по названию; товары вне конечных категорий — в конце. */
function catalogBlock(catalog: CatalogItem[], categories: LeafCategory[]): string {
  const known = new Set(categories.map((c) => c.id));
  const group = (name: string, items: CatalogItem[]) =>
    items.length === 0
      ? []
      : [`### ${name}\n${[...items].sort((a, b) => byCode(a.title, b.title) || byCode(a.id, b.id)).map(catalogLine).join("\n")}`];
  const groups = [
    ...categories.flatMap((c) => group(c.name, catalog.filter((p) => p.categoryId === c.id))),
    ...group("Без категории", catalog.filter((p) => !p.categoryId || !known.has(p.categoryId))),
  ];
  return groups.length ? groups.join("\n\n") : "- (каталог пуст)";
}

function lineBlock(r: ReviewRow, byId: Map<string, CatalogItem>): string {
  const l = r.line;
  const head = [`### ${l.id}: ${l.text}`, l.variant && `вариант: ${l.variant}`, l.en && `перевод: ${l.en}`]
    .filter(Boolean)
    .join("\n");
  const hint = r.candidates
    .map((c) => byId.get(c.productId))
    .filter((p): p is CatalogItem => !!p)
    .map((p) => `- ${shortId(p.id)} | ${p.title}`);
  return `${head}\nПодсказка поиска:\n${hint.length ? hint.join("\n") : "- (поиск ничего не нашёл)"}`;
}

export function buildMatchPrompt(rows: ReviewRow[], catalog: CatalogItem[], categories: LeafCategory[]): string {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  return `Ты — контент-менеджер магазина игровой периферии ChiSetup. Ниже весь наш каталог и строки документа поставки (накладная или заказ из китайского магазина), которые я не смог уверенно сопоставить с каталогом. К каждой строке — подсказка поиска: до 8 похожих товаров.

## Задача
Для каждой строки реши:
1. Это товар из нашего каталога → верни его ключ "product" (p…) и, если у товара есть варианты, точное название варианта "variant" из списка.
   Ищи по всему каталогу, не только в подсказке: в накладной товар часто назван иначе (WESTLAB, West Lab и WestLab — один бренд; «mouse feet» — наши «Глайды», «anti-slip» и «grip tape» — «Грипсы»).
   Это тот же товар, только если совпадают бренд, модель и версия (V2, Pro, Ultra, Mini, 8K — разные товары) и цвет. Разный цвет у нас — разные товары, если цвета нет среди вариантов. Товар с пометкой «скрыт» тоже наш, его просто нет на витрине.
2. Модель у нас есть, но по накладной не понять, какой именно это товар (не указан цвет, размер или версия) → "choose": ключи подходящих товаров, самый вероятный первым, а в "notes" — чего не хватает. Строку решит человек.
3. Этой модели у нас нет ни в каком цвете и версии → "new": новый товар. Найди модель в интернете (официальный сайт производителя, затем крупные магазины), чтобы назвать точно.
   - "title": по-русски — родовое слово + бренд + модель + цвет, бренд и модель латиницей, как у производителя («Коврик Zpmax ZP1 Advanced 490×420 чёрный», «Клавиатура Attack Shark R85 HE белая»). Размер коврика — если он часть модели.
   - "variant": только размер одежды / перчаток / рукавов (M, L, XL), иначе null. Цвет — часть названия, не вариант.
   - "brand": как пишет производитель.
   - "category": slug категории из списка ниже.
   - "source": ссылка на страницу, по которой ты опознал модель, или null.
4. Не уверен, есть ли модель у нас → "choose" с самыми близкими товарами. Уверен, что модели нет, но не уверен в названии → "new" с лучшим названием и пояснение в "notes". Ничего не выдумывай.

## Категории (slug — название)
${categories.map((c) => `- ${c.slug} — ${c.name}`).join("\n")}

## Наш каталог
ключ | название | бренд, если его нет в названии | варианты | скрыт

${catalogBlock(catalog, categories)}

## Строки
${rows.map((r) => lineBlock(r, byId)).join("\n\n")}

## Ответ
ОДИН блок \`\`\`json без пояснений, ключ — номер строки:
\`\`\`json
{
  "L1": { "product": "p1a2b3c4d", "variant": null, "notes": null },
  "L2": { "choose": ["p1a2b3c4d", "p5e6f7a8b"], "notes": "в накладной не указан цвет" },
  "L3": { "new": { "title": "…", "variant": null, "brand": "…", "category": "slug", "source": "https://…" }, "notes": "…" }
}
\`\`\``;
}

export interface MatchAnswer {
  decisions: Map<string, LineDecision>;
  /** Короткие списки ИИ по строкам, которые он не смог решить сам: id товаров, самый вероятный первым. */
  choices: Map<string, string[]>;
  notes: Map<string, string>;
  errors: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() && v.trim() !== "null" ? v.trim() : null);

function draftOf(raw: Obj, categories: LeafCategory[]): NewProductDraft | null {
  const title = str(raw.title);
  if (!title) return null;
  const slug = str(raw.category);
  return {
    title,
    brand: str(raw.brand),
    categoryId: categories.find((c) => c.slug === slug)?.id ?? null,
    variant: str(raw.variant),
    source: str(raw.source),
  };
}

interface Ctx {
  byKey: Map<string, CatalogItem>;
  categories: LeafCategory[];
  out: MatchAnswer;
}

function productOf(id: string, raw: unknown, ctx: Ctx): CatalogItem | null {
  const key = str(raw)?.toLowerCase() ?? null;
  const p = key ? ctx.byKey.get(key) : undefined;
  if (!p) ctx.out.errors.push(`${id}: товара ${key ?? "—"} нет в каталоге`);
  return p ?? null;
}

/** «choose»: известные ключи по порядку, без повторов, — в короткий список строки. */
function chooseOf(id: string, keys: unknown[], ctx: Ctx): void {
  const ids: string[] = [];
  for (const k of keys) {
    const p = productOf(id, k, ctx);
    if (p && !ids.includes(p.id)) ids.push(p.id);
  }
  if (ids.length) ctx.out.choices.set(id, ids);
}

/** Решение по строке или null: новый товар без названия, неизвестный товар или короткий список. */
function decisionOf(id: string, raw: Obj, ctx: Ctx): LineDecision | null {
  if (isObj(raw.new)) {
    const draft = draftOf(raw.new, ctx.categories);
    if (!draft) ctx.out.errors.push(`${id}: у нового товара нет названия`);
    return draft ? { kind: "new", draft } : null;
  }
  if (Array.isArray(raw.choose)) {
    chooseOf(id, raw.choose, ctx);
    return null;
  }
  const p = productOf(id, raw.product, ctx);
  if (!p) return null;
  const vName = str(raw.variant)?.toLowerCase();
  const v = vName ? p.variants.find((x) => x.name.toLowerCase() === vName) : undefined;
  if (p.variants.length > 0 && !v) {
    ctx.out.errors.push(`${id}: у «${p.title}» нет варианта «${raw.variant ?? ""}» — выберите вручную`);
    return null;
  }
  return { kind: "match", productId: p.id, variantId: v?.id ?? null, by: "ai" };
}

export function parseMatch(answer: string, catalog: CatalogItem[], categories: LeafCategory[]): MatchAnswer {
  const out: MatchAnswer = { decisions: new Map(), choices: new Map(), notes: new Map(), errors: [] };
  const json = extractJson(answer);
  if (json.error || !isObj(json.value)) {
    out.errors.push(json.error ?? "Ответ — не объект {\"L1\": …}");
    return out;
  }
  const byKey = new Map<string, CatalogItem>();
  for (const p of catalog) if (!byKey.has(shortId(p.id))) byKey.set(shortId(p.id), p);
  const ctx: Ctx = { byKey, categories, out };
  for (const [rawId, raw] of Object.entries(json.value)) {
    const id = rawId.toUpperCase();
    if (!isObj(raw)) continue;
    const d = decisionOf(id, raw, ctx);
    if (d) out.decisions.set(id, d);
    const note = str(raw.notes);
    if (note) out.notes.set(id, note);
  }
  return out;
}
