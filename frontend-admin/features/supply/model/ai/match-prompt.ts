/**
 * Шаг 2 «Поставки с ИИ»: только строки, которые поиск не нашёл уверенно, и по 8 ближайших товаров каталога к каждой.
 * ИИ решает: это один из кандидатов или новый товар (тогда — название по нашим правилам и категория). Размер
 * промпта зависит от числа нерешённых строк, а не от каталога. Ответ разбирает `parseMatch` ниже.
 */
import { extractJson } from "./json";
import type { CatalogItem, LineDecision, NewProductDraft, ReviewRow } from "./types";

export interface LeafCategory {
  id: string;
  slug: string;
  name: string;
}

/** Короткий ключ товара в промпте: "p" + первые 8 знаков id. */
export const shortId = (id: string) => `p${id.replace(/-/g, "").slice(0, 8)}`;

function lineBlock(r: ReviewRow, byId: Map<string, CatalogItem>): string {
  const l = r.line;
  const head = [`### ${l.id}: ${l.text}`, l.variant && `вариант: ${l.variant}`, l.en && `перевод: ${l.en}`]
    .filter(Boolean)
    .join("\n");
  const cands = r.candidates
    .map((c) => byId.get(c.productId))
    .filter((p): p is CatalogItem => !!p)
    .map((p) => `- ${shortId(p.id)} | ${p.title}${p.brand ? ` | ${p.brand}` : ""}${p.variants.length ? ` | варианты: ${p.variants.map((v) => v.name).join(", ")}` : ""}`);
  return `${head}\nКандидаты из нашего каталога:\n${cands.length ? cands.join("\n") : "- (нет похожих)"}`;
}

export function buildMatchPrompt(rows: ReviewRow[], catalog: CatalogItem[], categories: LeafCategory[]): string {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  return `Ты — контент-менеджер магазина игровой периферии ChiSetup. Ниже строки документа поставки (накладная или заказ из китайского магазина), которые я не смог уверенно сопоставить с нашим каталогом. К каждой — до 8 похожих товаров каталога.

## Задача
Для каждой строки реши:
1. Это один из кандидатов → верни его ключ "product" (p…) и, если у товара есть варианты, точное название варианта "variant" из списка.
   Это тот же товар, только если совпадают бренд, модель и версия (V2, Pro, Ultra, Mini, 8K — разные товары) и цвет. Разный цвет у нас — разные товары, если цвета нет среди вариантов.
2. Подходящего нет → "new": новый товар. Найди модель в интернете (официальный сайт производителя, затем крупные магазины), чтобы назвать точно.
   - "title": по-русски — родовое слово + бренд + модель + цвет, бренд и модель латиницей, как у производителя («Коврик Zpmax ZP1 Advanced 490×420 чёрный», «Клавиатура Attack Shark R85 HE белая»). Размер коврика — если он часть модели.
   - "variant": только размер одежды / перчаток / рукавов (M, L, XL), иначе null. Цвет — часть названия, не вариант.
   - "brand": как пишет производитель.
   - "category": slug категории из списка ниже.
   - "source": ссылка на страницу, по которой ты опознал модель, или null.
3. Не уверен → "new" с лучшим названием и пояснение в "notes". Ничего не выдумывай.

## Категории (slug — название)
${categories.map((c) => `- ${c.slug} — ${c.name}`).join("\n")}

## Строки
${rows.map((r) => lineBlock(r, byId)).join("\n\n")}

## Ответ
ОДИН блок \`\`\`json без пояснений, ключ — номер строки:
\`\`\`json
{
  "L1": { "product": "p1a2b3c4d", "variant": null, "notes": null },
  "L2": { "new": { "title": "…", "variant": null, "brand": "…", "category": "slug", "source": "https://…" }, "notes": "…" }
}
\`\`\``;
}

export interface MatchAnswer {
  decisions: Map<string, LineDecision>;
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

function decisionOf(id: string, raw: Obj, catalog: CatalogItem[], categories: LeafCategory[], errors: string[]): LineDecision | null {
  if (isObj(raw.new)) {
    const draft = draftOf(raw.new, categories);
    if (!draft) errors.push(`${id}: у нового товара нет названия`);
    return draft ? { kind: "new", draft } : null;
  }
  const key = str(raw.product)?.toLowerCase();
  const p = key ? catalog.find((x) => shortId(x.id) === key) : undefined;
  if (!p) {
    errors.push(`${id}: товар ${key ?? "—"} не из списка кандидатов`);
    return null;
  }
  const vName = str(raw.variant)?.toLowerCase();
  const v = vName ? p.variants.find((x) => x.name.toLowerCase() === vName) : undefined;
  if (p.variants.length > 0 && !v) {
    errors.push(`${id}: у «${p.title}» нет варианта «${raw.variant ?? ""}» — выберите вручную`);
    return null;
  }
  return { kind: "match", productId: p.id, variantId: v?.id ?? null, by: "ai" };
}

export function parseMatch(answer: string, catalog: CatalogItem[], categories: LeafCategory[]): MatchAnswer {
  const out: MatchAnswer = { decisions: new Map(), notes: new Map(), errors: [] };
  const json = extractJson(answer);
  if (json.error || !isObj(json.value)) {
    out.errors.push(json.error ?? "Ответ — не объект {\"L1\": …}");
    return out;
  }
  for (const [rawId, raw] of Object.entries(json.value)) {
    const id = rawId.toUpperCase();
    if (!isObj(raw)) continue;
    const d = decisionOf(id, raw, catalog, categories, out.errors);
    if (d) out.decisions.set(id, d);
    const note = str(raw.notes);
    if (note) out.notes.set(id, note);
  }
  return out;
}
