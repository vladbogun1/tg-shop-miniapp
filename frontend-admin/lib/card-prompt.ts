/**
 * THE prompt of the «Карточки» screen (docs/CATALOG-SPECS.md §4) — the one place to edit it.
 *
 * The admin copies the generated text into any AI chat with web search (ChatGPT, Claude, Gemini…;
 * no API keys), the AI answers with ONE ```json block, the admin pastes it back and
 * `card-check.ts` parses and validates it against the schema. If you change the answer format
 * here, change the parser there too.
 *
 * PURE module: no React, no DOM, no "@/" imports — the batch pipeline runs it from node:
 *   npx tsx -e "import('./frontend-admin/lib/card-prompt.ts').then(m => …)"
 * (see `buildCardPrompt` / `splitIntoBatches` / `normalizeSchema` / `assignCardIds`).
 * Imports only ./translation-prompt (GLOSSARY) — also pure.
 *
 * Answer format:
 *   ```json
 *   { "p0a1b2c3d": { "category", "brand", "specs", "confidence", "overall", "title"{ru,uk,en}, "description"{ru,uk,en}, "conditionNote"?,
 *                    "proposals", "sources", "notes" } }
 *   ```
 *   Keys are "p" + the first 8 hex chars of the product UUID (without dashes), lengthened when
 *   two products of the set share a prefix — stable across reloads and batches, so an old answer
 *   can still be pasted later.
 */

import { GLOSSARY } from "./translation-prompt";

// ============================================================================
// Schema (normalized: the same shape whatever the backend / schema file sends)
// ============================================================================

export type CardSpecType = "number" | "enum" | "multi" | "bool" | "text";
export type CardCondition = "NEW" | "MARKDOWN" | "USED";
export type CardStatusCode = "DRAFT" | "AI_FILLED" | "READY";

export interface CardOption {
  value: string;
  labelRu: string;
  labelUk?: string | null;
  labelEn?: string | null;
  aliases: string[];
}

export interface CardAttribute {
  /** Backend id (needed to add an option); absent when the schema comes from a file. */
  id?: string | null;
  key: string;
  labelRu: string;
  labelUk?: string | null;
  labelEn?: string | null;
  type: CardSpecType;
  /** Russian unit ("г", "мм"); null = none. */
  unit: string | null;
  /** number only: stored as {min,max}. */
  range: boolean;
  group?: string | null;
  required: boolean;
  /** Hint for the AI / admin (ru). */
  hint: string | null;
  /** Category that defines it; null = global (all categories). */
  categorySlug: string | null;
  options: CardOption[];
  sort: number;
}

export interface CardCategory {
  id?: string | null;
  slug: string;
  nameRu: string;
  parentSlug: string | null;
  sort: number;
}

export interface CardSchema {
  categories: CardCategory[];
  attributes: CardAttribute[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** First non-empty string among the given keys (snake_case, camelCase, nested `labels.ru`…). */
function pick(o: Obj, ...keys: string[]): string | null {
  for (const k of keys) {
    if (k.includes(".")) {
      const [a, b] = k.split(".");
      const inner = o[a];
      if (isObj(inner)) {
        const s = str(inner[b]);
        if (s) return s;
      }
      continue;
    }
    const s = str(o[k]);
    if (s) return s;
  }
  return null;
}

function aliasesOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  return [];
}

function typeOf(v: unknown): CardSpecType {
  const t = String(v ?? "").toLowerCase();
  return t === "number" || t === "enum" || t === "multi" || t === "bool" || t === "text" ? t : "text";
}

function normalizeOption(o: unknown): CardOption | null {
  if (typeof o === "string") return { value: o, labelRu: o, aliases: [] };
  if (!isObj(o)) return null;
  const value = pick(o, "value", "slug", "key");
  if (!value) return null;
  return {
    value,
    labelRu: pick(o, "label_ru", "labelRu", "labels.ru", "label", "name_ru", "nameRu") ?? value,
    labelUk: pick(o, "label_uk", "labelUk", "labels.uk"),
    labelEn: pick(o, "label_en", "labelEn", "labels.en"),
    aliases: aliasesOf(o.aliases),
  };
}

function normalizeAttribute(a: unknown, categorySlug: string | null, i: number): CardAttribute | null {
  if (!isObj(a)) return null;
  const key = pick(a, "key");
  if (!key) return null;
  const unitRaw = a.unit;
  const unit = isObj(unitRaw)
    ? str(unitRaw.ru)
    : str(unitRaw) ?? pick(a, "unit_ru", "unitRu", "units.ru");
  const options = (Array.isArray(a.options) ? a.options : []).map(normalizeOption).filter((x): x is CardOption => !!x);
  return {
    id: pick(a, "id"),
    key,
    labelRu: pick(a, "label_ru", "labelRu", "labels.ru", "label", "name") ?? key,
    labelUk: pick(a, "label_uk", "labelUk", "labels.uk"),
    labelEn: pick(a, "label_en", "labelEn", "labels.en"),
    type: typeOf(a.type),
    unit,
    range: a.range === true || a.is_range === true || a.isRange === true,
    group: pick(a, "group", "group_key", "groupKey"),
    required: a.required === true || a.required_for_ready === true || a.requiredForReady === true,
    hint: pick(a, "hint_ru", "hintRu", "hint"),
    categorySlug,
    options,
    sort: num(a.sort ?? a.sort_order ?? a.sortOrder, i),
  };
}

/**
 * Accepts both the schema file format (`schema-final.json`: categories[].attributes,
 * global_attributes, parent = slug, label_ru…) and the flat admin API format (categories with
 * id/parentId, attributes with categoryId, labelRu / labels.ru…).
 */
export function normalizeSchema(raw: unknown): CardSchema {
  const root = isObj(raw) ? raw : {};
  const rawCats = Array.isArray(root.categories) ? root.categories : [];
  const idToSlug = new Map<string, string>();
  for (const c of rawCats) if (isObj(c) && str(c.id) && str(c.slug)) idToSlug.set(String(c.id), String(c.slug));

  const categories: CardCategory[] = [];
  const attributes: CardAttribute[] = [];
  rawCats.forEach((c, i) => {
    if (!isObj(c)) return;
    const slug = pick(c, "slug");
    if (!slug) return;
    const parentRaw = c.parent ?? c.parentSlug ?? c.parent_slug ?? null;
    const parentId = str(c.parentId ?? c.parent_id);
    const parentSlug = str(parentRaw) ?? (parentId ? idToSlug.get(parentId) ?? null : null);
    categories.push({
      id: pick(c, "id"),
      slug,
      nameRu: pick(c, "name_ru", "nameRu", "names.ru", "name") ?? slug,
      parentSlug,
      sort: num(c.sort ?? c.sortOrder ?? c.sort_order, i),
    });
    if (Array.isArray(c.attributes)) {
      c.attributes.forEach((a, j) => {
        const n = normalizeAttribute(a, slug, j);
        if (n) attributes.push(n);
      });
    }
  });
  const globals = root.global_attributes ?? root.globalAttributes;
  if (Array.isArray(globals)) {
    globals.forEach((a, j) => {
      const n = normalizeAttribute(a, null, j);
      if (n) attributes.push(n);
    });
  }
  if (Array.isArray(root.attributes)) {
    root.attributes.forEach((a, j) => {
      if (!isObj(a)) return;
      const catId = str(a.categoryId ?? a.category_id);
      const catSlug = str(a.categorySlug ?? a.category_slug ?? a.category) ?? (catId ? idToSlug.get(catId) ?? null : null);
      const n = normalizeAttribute(a, catSlug, j);
      if (n) attributes.push(n);
    });
  }
  return { categories, attributes };
}

// ---- tree helpers ----------------------------------------------------------

export function categoryOf(schema: CardSchema, slug: string | null | undefined): CardCategory | null {
  return slug ? schema.categories.find((c) => c.slug === slug) ?? null : null;
}

/** Root → … → category. */
export function categoryPathOf(schema: CardSchema, slug: string | null | undefined): CardCategory[] {
  const out: CardCategory[] = [];
  let c = categoryOf(schema, slug);
  for (let guard = 0; c && guard < 10; guard++) {
    out.unshift(c);
    c = categoryOf(schema, c.parentSlug);
  }
  return out;
}

export function categoryPathName(schema: CardSchema, slug: string | null | undefined): string {
  return categoryPathOf(schema, slug).map((c) => c.nameRu).join(" › ");
}

export function isLeafCategory(schema: CardSchema, slug: string | null | undefined): boolean {
  return !!categoryOf(schema, slug) && !schema.categories.some((c) => c.parentSlug === slug);
}

/** Leaves in tree order (root sort, then child sort). */
export function leafCategories(schema: CardSchema): CardCategory[] {
  const bySort = (a: CardCategory, b: CardCategory) => a.sort - b.sort || a.nameRu.localeCompare(b.nameRu, "ru");
  const out: CardCategory[] = [];
  const walk = (parent: string | null) => {
    for (const c of schema.categories.filter((x) => x.parentSlug === parent).sort(bySort)) {
      if (schema.categories.some((x) => x.parentSlug === c.slug)) walk(c.slug);
      else out.push(c);
    }
  };
  walk(null);
  return out;
}

/** Leaves under a category (the category itself when it is a leaf). */
export function leavesUnder(schema: CardSchema, slug: string): CardCategory[] {
  return leafCategories(schema).filter((l) => categoryPathOf(schema, l.slug).some((c) => c.slug === slug));
}

/**
 * Attributes that apply to a category: global → root → … → the category, a deeper definition of
 * the same key wins. `includeGlobal=false` → only the category path.
 */
export function attributesForCategory(schema: CardSchema, slug: string | null | undefined, includeGlobal = true): CardAttribute[] {
  const path = categoryPathOf(schema, slug).map((c) => c.slug);
  const rank = new Map<string | null, number>();
  if (includeGlobal) rank.set(null, 0);
  path.forEach((s, i) => rank.set(s, i + 1));
  const byKey = new Map<string, CardAttribute>();
  const list = schema.attributes
    .filter((a) => rank.has(a.categorySlug))
    .sort((a, b) => rank.get(a.categorySlug)! - rank.get(b.categorySlug)! || a.sort - b.sort);
  for (const a of list) {
    if (byKey.has(a.key)) byKey.delete(a.key);
    byKey.set(a.key, a);
  }
  return list.filter((a) => byKey.get(a.key) === a);
}

// ============================================================================
// Products
// ============================================================================

/** One product as `GET /api/admin/cards/export` returns it (fields we read; extra ones are kept). */
export interface CardItem {
  id: string;
  title: string;
  slug?: string | null;
  categoryId?: string | null;
  categorySlug?: string | null;
  brand?: string | null;
  condition?: CardCondition | string | null;
  conditionNote?: string | null;
  description?: string | null;
  specs?: Record<string, unknown> | null;
  cardStatus?: CardStatusCode | string | null;
  cardConfidence?: number | null;
  cardMeta?: Record<string, unknown> | null;
  missingRequired?: string[] | null;
  variants?: (string | { name?: string | null })[] | null;
  imageUrl?: string | null;
  priceMinor?: number | null;
  /** Older name of priceMinor in the contract draft. */
  price?: number | null;
  active?: boolean | null;
  stock?: number | null;
}

const CONDITION_RU: Record<string, string> = { NEW: "Новый", MARKDOWN: "Уценка", USED: "Б/у" };

function lcp(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Product UUID → answer id: "p" + the shortest hex prefix (min 8) unique among the given ids.
 * Pass ALL products the screen knows (not one batch), so the ids do not depend on the selection.
 */
export function assignCardIds(productIds: string[]): Map<string, string> {
  const hexOf = new Map<string, string>();
  for (const id of productIds) hexOf.set(id, id.replace(/-/g, "").toLowerCase());
  const sorted = Array.from(new Set(hexOf.values())).sort();
  const len = new Map<string, number>();
  sorted.forEach((h, i) => {
    let n = 8;
    if (i > 0) n = Math.max(n, lcp(sorted[i - 1], h) + 1);
    if (i < sorted.length - 1) n = Math.max(n, lcp(sorted[i + 1], h) + 1);
    len.set(h, Math.min(n, h.length));
  });
  const out = new Map<string, string>();
  hexOf.forEach((h, id) => out.set(id, "p" + h.slice(0, len.get(h))));
  return out;
}

export function variantNames(item: CardItem): string[] {
  return (item.variants ?? [])
    .map((v) => (typeof v === "string" ? v : v?.name ?? ""))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function priceUah(item: CardItem): number | null {
  const minor = item.priceMinor ?? item.price;
  return typeof minor === "number" ? Math.round(minor) / 100 : null;
}

/** Batches keep the given order — sort by category first, so a batch needs fewer schema sections. */
export function splitIntoBatches<T>(items: T[], maxPerBatch = 8): T[][] {
  const size = Math.max(1, Math.floor(maxPerBatch));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ============================================================================
// Prompt
// ============================================================================

function header(part: number, total: number, count: number): string {
  const partLine =
    total > 1
      ? `Это пакет ${part} из ${total} (${count} товаров). Отвечай только по товарам этого пакета.`
      : `Всего товаров: ${count}.`;
  return `Ты — контент-менеджер интернет-магазина, который оформляет карточки товаров по проверенным данным из интернета.

## Зачем
ChiSetup — украинский магазин игровой периферии (мышки, клавиатуры, коврики, глайды, наушники, кейкапы, кабели и т. п.). Покупатели — геймеры, которые сравнивают товары по характеристикам. Характеристики у нас хранятся строго по схеме (ниже) — по ним работают фильтры и таблица «Характеристики» на сайте, поэтому точность важнее полноты.

## Задача
Для каждого товара ниже:
1. Проверь категорию: выбери slug категории-листа из списка «Категории». Меняй, только если текущая явно неверная (объясни в "notes").
2. Проверь бренд: верни точное название бренда, как пишет производитель (Attack Shark, VGN, Logitech). Меняй, только если текущий явно неверный или пустой.
3. Заполни характеристики строго по схеме категории товара, по надёжным источникам в интернете: сначала официальный сайт / даташит / страница товара производителя, затем крупные магазины и обзоры (RTINGS, EloShapes, Amazon, Rozetka и т. п.). Ищи именно эту модель и эту версию (V2, Pro, Ultra, 8K, Mini — разные товары).
4. Название "title": "ru" — наше чистое название: родовое слово + бренд + модель + цвет / вариант, как товар ищут в интернете («Мышь VGN Dragonfly F2 Ultra+ белая», «Коврик Attack Shark CM05 XL черный»); бренд и модель — латиницей, как у производителя. Если текущее название уже нормальное — верни его без изменений. "uk" и "en" — переводы этого ru.
5. Описание "description": "ru" — 1–3 коротких абзаца, деловой тон, чем товар хорош и для кого, без маркетинговой воды и без списка характеристик (характеристики показываются таблицей отдельно). Обязательно сохрани из текущего описания все оговорки: уценка / б/у / дефекты / вскрытая упаковка / комплектация / размеры одежды и любые важные для покупателя условия. Ничего не выдумывай. "uk" и "en" — переводы этого ru. Если хорошего текста не получается — не возвращай "description" вовсе.
6. Только если у товара есть "conditionNote" (причина уценки / состояние б/у): верни "conditionNote" — "ru" как есть (символ в символ), "uk" и "en" — переводы.
${partLine}

## Жёсткие правила
1. Не выдумывай. Нет надёжного источника — не заполняй поле (просто не пиши ключ). Пустое лучше неверного.
2. Ключи "specs" — только из схемы категории товара (атрибуты категории, её родителя и «Общие»). Никаких своих ключей.
3. enum — ровно одно значение value из списка опций; multi — массив value из списка. Если подходящей опции нет — не пиши поле в "specs", а добавь в "proposals" {"key", "value": "как в источнике", "why"}.
4. number — JSON-число в единицах схемы (вес в граммах, размеры в мм и т. п.), без единиц и текста: 51, а не "51 г". Если в источнике другие единицы — переведи. Дробная часть — через точку.
5. Атрибуты с пометкой «диапазон» — объект {"min": число, "max": число} (DPI 50–30 000 → {"min": 50, "max": 30000}); если значение одно — min = max.
6. bool — true / false, только если уверен; «не знаю» — не пиши поле.
7. text — короткая строка (модель сенсора, свитчей, чипа), как у производителя.
8. Товар no-name / неизвестная модель / нет информации в интернете: заполни только то, что явно видно из названия, описания и вариантов (цвет, размер, тип подключения), уверенность низкая; остальное пропусти и напиши об этом в "notes".
9. Категорию и бренд не меняй без явной причины — причину в "notes".
10. Уценка / б/у: характеристики — как у нового товара этой модели; оговорку о состоянии — в описании.
11. "sources" — ссылки на страницы, откуда реально взяты данные (официальный сайт первым). Без выдуманных ссылок.
12. "specs" не переводятся: значения опций — латинские коды из схемы, text — названия моделей как у производителя.

## Переводы (uk, en) — правила
1. Переводи только смысл ru: ничего не добавляй и не убирай.
2. НЕ переводи бренды и модели (Attack Shark, VGN Dragonfly F2 Ultra+, PixArt PAW3950, Hall Effect, Poron, PTFE, USB Type-C), артикулы, названия расцветок латиницей (Wave Pink), размеры одежды (XL). Любое латинское слово ru должно остаться в uk и en как есть.
3. Числа, диапазоны, проценты — символ в символ (490 × 420 мм, 50–30 000, 75 %). Единицы: в uk как в ru (мм, г, Гц; «об/хв» вместо «об/мин»), в en — mm, g, Hz, rpm. Ни одно число не должно пропасть или появиться. Цены: uk «500 грн», en «500 UAH».
4. Структура 1:1: те же переносы строк, пустые строки, маркеры и эмодзи — количество строк в uk и en равно количеству строк ru.
5. Украинский — литературный, без русизмов и без букв ы, э, ъ, ё («килимок», «чорний», «бездротова», «частота опитування»). Английский — американский, естественный, без кириллицы. Название в en — в естественном порядке слов: «Attack Shark CM05 XL Mouse Pad, Black».

## Глоссарий (ru → uk → en), использовать обязательно
${GLOSSARY}

## Уверенность (0–100) — по каждому заполненному полю в "confidence" и общая в "overall"
- 90–100 — официальный сайт / даташит производителя;
- 70–89 — крупный магазин или обзор, значение совпадает минимум в двух источниках;
- 40–69 — один неофициальный источник или вывод по аналогичной / соседней модели;
- ниже 40 — догадка → такое поле лучше не заполнять.
"overall" — насколько ты уверен в карточке в целом (что это та самая модель и данные верны).

## Формат ответа — СТРОГО
Ответ — ровно ОДИН блок кода \`\`\`json, без текста до и после. Внутри — один JSON-объект: ключи — id товаров из входных данных (ровно те же, например "p0a1b2c3d"), значения — объекты:
- "category" — slug категории-листа;
- "brand" — название бренда;
- "specs" — { ключ: значение } по схеме;
- "confidence" — { ключ: 0..100 } для каждого ключа из "specs";
- "overall" — 0..100;
- "title" — { "ru", "uk", "en" };
- "description" — { "ru", "uk", "en" } (переносы строк — \\n), необязательно;
- "conditionNote" — { "ru", "uk", "en" }, только если у товара есть conditionNote;
- "proposals" — [{ "key", "value", "why" }] — значения, которых нет в списке опций, необязательно;
- "sources" — [ссылки];
- "notes" — заметки для админа (что не нашлось, сомнения), необязательно.
Кавычки внутри текста экранируй (\\"). Без комментариев и без висячих запятых. Пример (условный — ключи и опции бери только из схемы ниже):
\`\`\`json
{
  "p0a1b2c3d": {
    "category": "myshki",
    "brand": "VGN",
    "specs": { "weight_g": 51, "sensor": "paw3950", "connectivity": ["wired", "2_4ghz", "bluetooth"], "max_dpi": 30000 },
    "confidence": { "weight_g": 95, "sensor": 98, "connectivity": 90, "max_dpi": 90 },
    "overall": 92,
    "title": { "ru": "Мышь VGN Dragonfly F2 Ultra+ белая", "uk": "Мишка VGN Dragonfly F2 Ultra+ біла", "en": "VGN Dragonfly F2 Ultra+ Mouse, White" },
    "description": { "ru": "VGN Dragonfly F2 Ultra+ — лёгкая беспроводная мышь для шутеров…", "uk": "VGN Dragonfly F2 Ultra+ — легка бездротова мишка для шутерів…", "en": "VGN Dragonfly F2 Ultra+ is a lightweight wireless mouse for shooters…" },
    "conditionNote": { "ru": "вскрыта упаковка", "uk": "відкрита упаковка", "en": "opened box" },
    "proposals": [ { "key": "sensor", "value": "PAW3950 Ultra", "why": "нет в списке" } ],
    "sources": ["https://vgnlab.com/products/f2-ultra-plus"],
    "notes": "Вес указан без кабеля."
  }
}
\`\`\`
Если ответ не помещается в одно сообщение — не сокращай: остановись на границе товара (закрой JSON), а я попрошу продолжить.
`;
}

function optionLine(o: CardOption): string {
  return o.labelRu && o.labelRu !== o.value ? `${o.value} (${o.labelRu})` : o.value;
}

function attributeLine(a: CardAttribute): string {
  const parts: string[] = [`- ${a.key} — ${a.labelRu}`];
  let type: string = a.type;
  if (a.type === "number") type = a.range ? `number, диапазон {"min","max"}` : "number";
  if (a.type === "multi") type = "multi (массив)";
  parts.push(a.unit ? `${type}, ${a.unit}` : type);
  if (a.required) parts.push("обязательное");
  let line = parts.join(" — ");
  if (a.hint) line += ` — подсказка: ${a.hint}`;
  if ((a.type === "enum" || a.type === "multi") && a.options.length) {
    line += `\n    опции: ${a.options.map(optionLine).join("; ")}`;
  }
  return line;
}

/** Schema section: leaf list + global attributes + attributes of the categories of the batch. */
export function schemaSection(items: CardItem[], schema: CardSchema): string {
  const out: string[] = [];
  const leaves = leafCategories(schema);
  out.push("## Категории (товар кладётся только в лист; slug — название)");
  for (const l of leaves) out.push(`- ${l.slug} — ${categoryPathName(schema, l.slug)}`);

  const globals = schema.attributes.filter((a) => a.categorySlug === null).sort((a, b) => a.sort - b.sort);
  out.push("", "## Схема характеристик", "", "### Общие для всех категорий");
  if (globals.length) for (const a of globals) out.push(attributeLine(a));
  else out.push("- (нет)");

  // Leaves the batch needs: the product's leaf, or every leaf under a parent category.
  const needed: string[] = [];
  const add = (slug: string) => !needed.includes(slug) && needed.push(slug);
  let uncategorized = false;
  for (const it of items) {
    const slug = it.categorySlug ?? null;
    if (!slug || !categoryOf(schema, slug)) {
      uncategorized = true;
      continue;
    }
    if (isLeafCategory(schema, slug)) add(slug);
    else leavesUnder(schema, slug).forEach((l) => add(l.slug));
  }
  // Each category of the needed paths once, with its OWN attributes: a parent section is shared by
  // all its leaves instead of being repeated in each of them.
  const sections: string[] = [];
  for (const leaf of needed) for (const c of categoryPathOf(schema, leaf)) if (!sections.includes(c.slug)) sections.push(c.slug);
  if (sections.length) {
    out.push("", "Характеристики товара = «Общие» + раздел его корневой категории + раздел его подкатегории (если есть).");
  }
  for (const slug of sections) {
    const leaf = isLeafCategory(schema, slug);
    out.push("", `### ${slug} — ${categoryPathName(schema, slug)}${leaf ? "" : " (для всех подкатегорий)"}`);
    const attrs = schema.attributes.filter((a) => a.categorySlug === slug).sort((a, b) => a.sort - b.sort);
    if (attrs.length) for (const a of attrs) out.push(attributeLine(a));
    else out.push("- (своих характеристик нет)");
  }
  if (uncategorized) {
    out.push(
      "",
      "У части товаров нет категории или она неизвестна: выбери для них категорию-лист и заполни только общие характеристики — схему этой категории я пришлю следующим запросом."
    );
  }
  return out.join("\n");
}

/** Input of one product as it goes into the prompt. */
export function productInput(item: CardItem, schema: CardSchema): Record<string, unknown> {
  const o: Record<string, unknown> = { title: item.title };
  o.brand = item.brand ?? null;
  const slug = item.categorySlug ?? null;
  o.category = slug;
  if (slug) {
    const path = categoryPathName(schema, slug);
    if (path) o.categoryPath = path;
    if (categoryOf(schema, slug) && !isLeafCategory(schema, slug)) o.categoryNote = "это не лист — выбери подкатегорию";
  }
  const cond = String(item.condition ?? "NEW").toUpperCase();
  if (cond !== "NEW") o.condition = CONDITION_RU[cond] ?? cond;
  if (item.conditionNote) o.conditionNote = item.conditionNote;
  const variants = variantNames(item);
  if (variants.length) o.variants = variants;
  const uah = priceUah(item);
  if (uah !== null) o.priceUah = uah;
  o.description = item.description ?? "";
  const specs = item.specs && Object.keys(item.specs).length ? item.specs : null;
  o.specs = specs ?? {};
  if (item.missingRequired?.length) o.missingRequired = item.missingRequired;
  return o;
}

export interface CardPromptOptions {
  part: number;
  total: number;
  /** UUID → answer id over ALL products of the screen (see assignCardIds); default — the batch only. */
  ids?: Map<string, string>;
}

/** The full text of one batch. */
export function buildCardPrompt(items: CardItem[], schema: CardSchema, opts: CardPromptOptions): string {
  const ids = opts.ids ?? assignCardIds(items.map((i) => i.id));
  const input: Record<string, unknown> = {};
  for (const it of items) input[ids.get(it.id) ?? assignCardIds([it.id]).get(it.id)!] = productInput(it, schema);
  return (
    header(opts.part, opts.total, items.length) +
    "\n" +
    schemaSection(items, schema) +
    "\n\n## Товары (JSON: id → текущие данные; category — slug, specs — текущие значения по схеме)\n" +
    "```json\n" +
    JSON.stringify(input, null, 2) +
    "\n```\n"
  );
}
