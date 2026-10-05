/**
 * THE translation prompt for the «Переводы» screen — the one place to edit it.
 *
 * The admin copies the generated text into any AI chat (ChatGPT, Claude, …; no API keys), the AI
 * answers with ONE ```json code block, the admin pastes it back and `translation-check.ts` parses
 * and validates it. If you change the answer format here, change the parser there too.
 *
 * Answer format (and why):
 *   ```json
 *   {
 *     "t3fa9c1": { "ru": "…", "uk": "…", "en": "…" },
 *     …
 *   }
 *   ```
 *   - JSON — every chat model writes it reliably, and `\n` escapes make line breaks unambiguous
 *     (plain-text formats lose or invent blank lines).
 *   - Keys are short ids derived from the SHA-256 of the Russian source ("t" + first 6+ hex chars,
 *     lengthened on collision). They are stable across page reloads and parts, so an old answer can
 *     be pasted later; if the source changed meanwhile, its id no longer exists and the row is
 *     rejected instead of being applied to the wrong text.
 *   - One id per UNIQUE Russian string: many products share a description, it is translated once
 *     and fanned out to every field with that hash.
 *   - "ru" = the source proofread (typos only). Manual input has typos; the screen shows the
 *     difference as a suggested fix of the original, applied only on the admin's click.
 *
 * The rules and the glossary come from docs/i18n-glossary.md (used for the first translation,
 * 2026-10-04) — keep both in sync.
 */

/** Size of one part: the AI chat must take it in one message and answer without truncation. */
export const PART_MAX_SOURCE_CHARS = 12_000;
export const PART_MAX_STRINGS = 60;

/** One unique Russian string as it goes into the prompt. */
export interface PromptString {
  id: string;
  /** What the string is (see KIND_LABEL) — titles and variant names are translated differently. */
  kind: string;
  /** For variant names: the product they belong to (context only, not translated). */
  product?: string | null;
  ru: string;
}

/** Human (and AI) readable name of a field. Key = `${entityType}.${field}`. */
export const KIND_LABEL: Record<string, string> = {
  "PRODUCT.title": "название товара",
  "PRODUCT.description": "описание товара",
  "PRODUCT.seo_title": "SEO-заголовок страницы товара",
  "PRODUCT.seo_description": "SEO-описание страницы товара (сниппет в поиске)",
  "VARIANT.name": "вариант товара (цвет / размер / комплектация)",
  "TAG.name": "категория каталога (пункт меню)",
  "TAG.seo_title": "SEO-заголовок страницы категории (заголовок вкладки и поиска, до ~60 символов)",
  "TAG.seo_description": "SEO-описание страницы категории (сниппет в поиске)",
  "TAG.h1": "заголовок H1 страницы категории",
  "TAG.intro_text": "SEO-текст страницы категории (несколько абзацев)",
  "PAYMENT_OPTION.title": "способ оплаты (название)",
  "PAYMENT_OPTION.description": "способ оплаты (пояснение покупателю)",
};

/** Short Russian label for the admin UI. */
export const KIND_SHORT: Record<string, string> = {
  "PRODUCT.title": "Название",
  "PRODUCT.description": "Описание",
  "PRODUCT.seo_title": "SEO-заголовок",
  "PRODUCT.seo_description": "SEO-описание",
  "VARIANT.name": "Вариант",
  "TAG.name": "Категория",
  "TAG.seo_title": "Категория: SEO-заголовок",
  "TAG.seo_description": "Категория: SEO-описание",
  "TAG.h1": "Категория: H1",
  "TAG.intro_text": "Категория: SEO-текст",
  "PAYMENT_OPTION.title": "Оплата",
  "PAYMENT_OPTION.description": "Оплата: описание",
};

/** Glossary ru → uk | en (docs/i18n-glossary.md, «Термины»). */
export const GLOSSARY = `
Глайды, скейтсы → uk: Глайди → en: mouse skates (glides); категория — «Mouse Skates»
Дуйки (аккумуляторная воздуходувка) → uk: Дуйки (повітродувки); категория — «Дуйки» → en: air blowers; категория — «Air Blowers»
Кабеля / кабель → uk: Кабелі / кабель → en: Cables / cable
Кейкапы, кепки (на клаву) → uk: Кейкапи → en: Keycaps
клава → uk: клавіатура → en: keyboard
КЛВ Магнитные → uk: Магнітні клавіатури → en: Magnetic Keyboards
КЛВ Механические → uk: Механічні клавіатури → en: Mechanical Keyboards
Коврики, ковер, ковёр → uk: Килимки, килимок → en: Mouse pads, mouse pad
Кресла → uk: Крісла → en: Chairs
Мышки, мышь → uk: Мишки, мишка/миша → en: Mice, mouse
Наушники → uk: Навушники → en: Headphones
Рукава, рукав → uk: Рукави, рукав → en: Gaming sleeves, gaming sleeve
Стеклянный пад, стеклопад → uk: Скляні пади, склопад → en: Glass mouse pads, glass pad
Столы → uk: Столи → en: Desks
Уценка → uk: Уцінка → en: Discounted (open box); категория — «Discounted»
на весь стол → uk: на весь стіл → en: desk-size
переключатели / свитчи → uk: перемикачі / світчі → en: switches
частота опроса → uk: частота опитування → en: polling rate
подсветка → uk: підсвітка → en: backlight / RGB lighting
беспроводная / проводная → uk: бездротова / дротова → en: wireless / wired
скольжение → uk: ковзання → en: glide
новые (вариант) → uk: нові → en: New
открытая пачка (вариант) → uk: відкрита пачка → en: Opened pack
Передоплата 100 грн → uk: Передоплата 100 грн → en: 100 UAH prepayment
Полная оплата на счет ФОП → uk: Повна оплата на рахунок ФОП → en: Full payment to the store's account (FOP)
ФОП → uk: ФОП → en: FOP (sole proprietor) в длинном тексте; в коротком — «store account»
наложенный платёж → uk: накладений платіж → en: cash on delivery
Новая Почта → uk: Нова Пошта → en: Nova Poshta
`.trim();

/** Everything before the strings. Edit freely — the parser depends only on the answer format. */
function header(part: number, total: number, count: number): string {
  const partLine =
    total > 1
      ? `Это часть ${part} из ${total} (${count} строк). Отвечай только на строки этой части.`
      : `Всего строк: ${count}.`;
  return `Ты — профессиональный переводчик-локализатор интернет-магазина.

## Зачем
ChiSetup — украинский магазин игровой периферии (мышки, клавиатуры, коврики, глайды, наушники и т. п.). Покупатели — геймеры. Сайт и Telegram-магазин работают на трёх языках: русский (оригинал), украинский и английский. Нужно перевести тексты товаров, вариантов, категорий и способов оплаты. Тон — короткий, деловой, без маркетинговой воды, как в оригинале.

## Задача
Для каждой строки ниже верни три текста:
- "ru" — оригинал, ВЫЧИТАННЫЙ: исправь только явные опечатки (орфография, пропущенные/лишние/переставленные буквы). Не меняй смысл, слова, порядок, стиль, пунктуацию «на вкус», е/ё, форматирование и числа. Если ошибок нет — верни оригинал символ в символ.
- "uk" — перевод на украинский (с исправленного ru).
- "en" — перевод на английский (с исправленного ru).
${partLine}

## Жёсткие правила
1. Только смысл оригинала: не добавляй факты, характеристики, обещания; ничего не удаляй.
2. НЕ переводи бренды и модели (Attack Shark, MCHOSE A7 V2 Pro, X-raypad Aqua Control+ (AC+), PixArt PAW3950, Hall Effect, Amundsen, Poron, PTFE, UHMWPE/UPE, Bluetooth 5.4, USB Type-C), артикулы, коды цветов, названия расцветок латиницей (Wave Pink, Sakura), размеры одежды (XL, 3XL). Любое латинское слово оригинала должно остаться в uk как есть.
3. Числа, диапазоны, проценты, единицы — символ в символ (490 × 420 мм, 50–30 000, 75 %, 2000 mAh). Десятичный разделитель и пробелы внутри чисел не менять. Единицы: в uk как в оригинале (мм, г, Гц; «об/хв» вместо «об/мин»), в en — mm, g, Hz, rpm. Ни одно число не должно пропасть или появиться.
4. Форматирование 1:1: переносы строк, пустые строки, маркеры (•, -, —), эмодзи, двойные пробелы. Количество строк в uk/en/ru = количеству строк оригинала.
5. Цены в тексте: uk «500 грн», en «500 UAH».
6. Явные опечатки оригинала исправляй и в переводе. Корявый машинный перевод с китайского — передай смысл нормальным языком, не дословно.
7. Если оригинал уже на украинском: uk = оригинал с минимальной правкой опечаток, en — перевод, ru — оригинал без изменений.
8. Названия товаров: переводится только родовое слово и описательные части, бренд/модель остаются. «Ковер Attack Shark черный» → uk «Килимок Attack Shark чорний», en «Attack Shark Mouse Pad, Black». «Рукав (аниме молнии)» → uk «Рукав (аніме блискавки)», en «Gaming Sleeve (Anime Lightning)». В en — естественный порядок слов; цвет можно в конце через запятую или в скобках, как в оригинале.
9. Украинский — литературный, без русизмов и без букв ы, э, ъ, ё («килимок», а не «коврик»; «чорний», «бездротова», «перемикачі»/«світчі», «частота опитування», «сенсор»). Английский — американский, естественный, без канцелярита и без кириллицы.
10. "kind" и "product" во входных данных — только контекст, их не переводи и не возвращай.

## Глоссарий (ru → uk → en), использовать обязательно
${GLOSSARY}

## Формат ответа — СТРОГО
Ответ — ровно ОДИН блок кода \`\`\`json, без текста до и после. Внутри — один JSON-объект: ключи — id строк из входных данных (ровно те же, все до одного, без новых), значения — объекты с полями "ru", "uk", "en" (строки). Переносы строк внутри текста — \\n, кавычки внутри текста экранируй (\\"). Без комментариев и без висячих запятых. Пример:
\`\`\`json
{
  "t0a1b2c": { "ru": "Ковер Attack Shark черный", "uk": "Килимок Attack Shark чорний", "en": "Attack Shark Mouse Pad, Black" },
  "t9f8e7d": { "ru": "Размер: 490 × 420 мм\\nТолщина: 4 мм", "uk": "Розмір: 490 × 420 мм\\nТовщина: 4 мм", "en": "Size: 490 × 420 mm\\nThickness: 4 mm" }
}
\`\`\`
Если ответ не помещается в одно сообщение — не сокращай тексты: остановись на границе строки, а я попрошу продолжить.

## Строки для перевода (JSON: id → { kind, product?, ru })
`;
}

/** The full text of one part. */
export function buildPrompt(strings: PromptString[], part: number, total: number): string {
  const input: Record<string, { kind: string; product?: string; ru: string }> = {};
  for (const s of strings) {
    input[s.id] = s.product ? { kind: s.kind, product: s.product, ru: s.ru } : { kind: s.kind, ru: s.ru };
  }
  return header(part, total, strings.length) + "```json\n" + JSON.stringify(input, null, 2) + "\n```\n";
}

/**
 * Splits the strings into parts by source size and count, keeping the given order (related
 * strings stay together). A single string longer than the budget gets a part of its own.
 */
export function splitIntoParts<T extends { ru: string }>(strings: T[]): T[][] {
  const parts: T[][] = [];
  let cur: T[] = [];
  let chars = 0;
  for (const s of strings) {
    const len = s.ru.length;
    if (cur.length > 0 && (chars + len > PART_MAX_SOURCE_CHARS || cur.length >= PART_MAX_STRINGS)) {
      parts.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(s);
    chars += len;
  }
  if (cur.length) parts.push(cur);
  return parts;
}
