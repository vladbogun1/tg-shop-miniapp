/**
 * THE prompt of the «Карточки» screen (docs/CATALOG-SPECS.md §4) — the one place to edit it.
 *
 * The admin copies the generated text into any AI chat with web search (ChatGPT, Claude, Gemini…;
 * no API keys), the AI answers with ONE ```json block, the admin pastes it back and
 * `check.ts` parses and validates it against the schema. If you change the answer format
 * here, change the parser there too.
 *
 * PURE module: no React, no DOM, no "@/" imports — the batch pipeline runs it from node:
 *   npx tsx -e "import('./frontend-admin/features/cards/model/prompt.ts').then(m => …)"
 * (see `buildCardPrompt` / `splitIntoBatches` / `normalizeSchema` / `assignCardIds`).
 * Imports only @/features/translation (GLOSSARY) — also pure.
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

import { GLOSSARY } from "@/features/translation";

import {
  categoryOf,
  categoryPathName,
  categoryPathOf,
  isLeafCategory,
  leafCategories,
  leavesUnder,
  type CardAttribute,
  type CardOption,
  type CardSchema,
} from "./schema";
import { assignCardIds, priceUah, variantNames, type CardItem } from "./item";

const CONDITION_RU: Record<string, string> = { NEW: "Новый", MARKDOWN: "Уценка", USED: "Б/у" };

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
- "field_sources" — { ключ: ссылка } — откуда взято значение поля, если не с первой ссылки "sources", необязательно;
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

/** Листья категорий, схема которых нужна пакету: лист товара или все листья под родителем. */
function neededLeaves(items: CardItem[], schema: CardSchema): { leaves: string[]; uncategorized: boolean } {
  const leaves: string[] = [];
  const add = (slug: string) => !leaves.includes(slug) && leaves.push(slug);
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
  return { leaves, uncategorized };
}

/** Each category of the needed paths once: a parent section is shared by all its leaves instead of repeated in each. */
function sectionSlugs(leaves: string[], schema: CardSchema): string[] {
  const sections: string[] = [];
  for (const leaf of leaves) for (const c of categoryPathOf(schema, leaf)) if (!sections.includes(c.slug)) sections.push(c.slug);
  return sections;
}

function categorySection(slug: string, schema: CardSchema): string[] {
  const leaf = isLeafCategory(schema, slug);
  const out = ["", `### ${slug} — ${categoryPathName(schema, slug)}${leaf ? "" : " (для всех подкатегорий)"}`];
  const attrs = schema.attributes.filter((a) => a.categorySlug === slug).sort((a, b) => a.sort - b.sort);
  if (attrs.length) for (const a of attrs) out.push(attributeLine(a));
  else out.push("- (своих характеристик нет)");
  return out;
}

const UNCATEGORIZED_NOTE =
  "У части товаров нет категории или она неизвестна: выбери для них категорию-лист и заполни только общие характеристики — схему этой категории я пришлю следующим запросом.";

/** Schema section: leaf list + global attributes + attributes of the categories of the batch. */
export function schemaSection(items: CardItem[], schema: CardSchema): string {
  const out: string[] = [];
  out.push("## Категории (товар кладётся только в лист; slug — название)");
  for (const l of leafCategories(schema)) out.push(`- ${l.slug} — ${categoryPathName(schema, l.slug)}`);

  const globals = schema.attributes.filter((a) => a.categorySlug === null).sort((a, b) => a.sort - b.sort);
  out.push("", "## Схема характеристик", "", "### Общие для всех категорий");
  if (globals.length) for (const a of globals) out.push(attributeLine(a));
  else out.push("- (нет)");

  const { leaves, uncategorized } = neededLeaves(items, schema);
  const sections = sectionSlugs(leaves, schema);
  if (sections.length) {
    out.push("", "Характеристики товара = «Общие» + раздел его корневой категории + раздел его подкатегории (если есть).");
  }
  for (const slug of sections) out.push(...categorySection(slug, schema));
  if (uncategorized) out.push("", UNCATEGORIZED_NOTE);
  return out.join("\n");
}

function categoryHints(item: CardItem, schema: CardSchema): Record<string, unknown> {
  const slug = item.categorySlug ?? null;
  if (!slug) return {};
  const o: Record<string, unknown> = {};
  const path = categoryPathName(schema, slug);
  if (path) o.categoryPath = path;
  if (categoryOf(schema, slug) && !isLeafCategory(schema, slug)) o.categoryNote = "это не лист — выбери подкатегорию";
  return o;
}

/** Input of one product as it goes into the prompt. */
export function productInput(item: CardItem, schema: CardSchema): Record<string, unknown> {
  const o: Record<string, unknown> = { title: item.title };
  o.brand = item.brand ?? null;
  o.category = item.categorySlug ?? null;
  Object.assign(o, categoryHints(item, schema));
  const cond = String(item.condition ?? "NEW").toUpperCase();
  if (cond !== "NEW") o.condition = CONDITION_RU[cond] ?? cond;
  if (item.conditionNote) o.conditionNote = item.conditionNote;
  const variants = variantNames(item);
  if (variants.length) o.variants = variants;
  const uah = priceUah(item);
  if (uah !== null) o.priceUah = uah;
  o.description = item.description ?? "";
  o.specs = (item.specs && Object.keys(item.specs).length ? item.specs : null) ?? {};
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
