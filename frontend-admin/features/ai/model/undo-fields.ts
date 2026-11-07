/**
 * Ключи журнала применений (`ai_apply_log`) человеческими словами: что вернёт «Отменить применение» и что после
 * отмены осталось, потому что после применения это правили вручную. Ключи — как у сервера: `title`, `description`,
 * `spec:dpi`, `photo:<ключ файла>`, `tr:uk:title`, `status`, `confidence`, `meta`, `active`, `unfinished`. Чистая логика.
 */

type UndoCounts = { reverted: number; skipped: number; skippedFields: readonly string[] };

const PLAIN_BEFORE: ReadonlyArray<[string, string]> = [
  ["title", "название"],
  ["description", "описание"],
  ["category", "категория"],
  ["brand", "бренд"],
];
const PLAIN_AFTER: ReadonlyArray<[string, string]> = [
  ["status", "статус карточки"],
  ["confidence", "уровень уверенности"],
  ["meta", "источники и отметки уверенности"],
  ["active", "выкладка на витрину"],
  ["unfinished", "отметка «Незавершённые»"],
];
const TR_FIELDS: Record<string, string> = {
  title: "название",
  description: "описание",
  condition_note: "примечание о состоянии",
  seo_title: "SEO-заголовок",
  seo_description: "SEO-описание",
};
const KNOWN = new Set([...PLAIN_BEFORE, ...PLAIN_AFTER].map(([k]) => k));

function specsPart(keys: readonly string[]): string | null {
  const specs = keys.filter((k) => k.startsWith("spec:")).map((k) => k.slice(5));
  if (!specs.length) return null;
  return specs.length === 1 ? `характеристика «${specs[0]}»` : `характеристики (${specs.length})`;
}

function photosPart(keys: readonly string[]): string | null {
  const n = keys.filter((k) => k.startsWith("photo:")).length;
  return n ? `фото (${n})` : null;
}

/** «перевод uk: название, описание» — по языку. */
function translationParts(keys: readonly string[]): string[] {
  const byLocale = new Map<string, string[]>();
  for (const k of keys) {
    if (!k.startsWith("tr:")) continue;
    const [, locale, field] = k.split(":");
    byLocale.set(locale, [...(byLocale.get(locale) ?? []), TR_FIELDS[field] ?? field]);
  }
  return [...byLocale.entries()].map(([locale, fields]) => `перевод ${locale}: ${fields.join(", ")}`);
}

const plainParts = (keys: readonly string[], table: ReadonlyArray<[string, string]>) =>
  table.filter(([k]) => keys.includes(k)).map(([, label]) => label);

const isGrouped = (k: string) => k.startsWith("spec:") || k.startsWith("photo:") || k.startsWith("tr:") || KNOWN.has(k);

/** Ключи журнала → части списка в постоянном порядке: тексты карточки, характеристики, фото, переводы, статус, витрина. */
export function undoFieldParts(keys: readonly string[]): string[] {
  const parts = [
    ...plainParts(keys, PLAIN_BEFORE),
    specsPart(keys),
    photosPart(keys),
    ...translationParts(keys),
    ...plainParts(keys, PLAIN_AFTER),
    ...keys.filter((k) => !isGrouped(k)),
  ];
  return parts.filter((p): p is string => !!p);
}

export const undoFieldsText = (keys: readonly string[]): string => undoFieldParts(keys).join("; ");

const AFTER_KEYS = new Set(PLAIN_AFTER.map(([k]) => k));

/**
 * Поле карточки (название, описание, категория, бренд, характеристика), а не то, что журнал пишет рядом: фото,
 * переводы, статус, уверенность, отметки, витрина. «Записано полей: N» считает только поля.
 */
export const isCardFieldKey = (k: string): boolean => !AFTER_KEYS.has(k) && !k.startsWith("photo:") && !k.startsWith("tr:");

/** Что «Отменить применение» не вернёт — по тому, что записало это применение. */
export function undoStaysText(changed: readonly string[]): string {
  const stays = [
    changed.includes("brand") ? "новый бренд, если его завело применение, останется в «Брендах»" : null,
    changed.includes("active") ? "цена, введённая при выкладке, останется" : null,
    "поле, которое после применения изменили вручную, останется как есть",
  ];
  return stays.filter((s): s is string => !!s).join("; ");
}

/** Итог отмены одной строкой: сколько вернулось и что осталось, потому что правили вручную. */
export function undoneText(r: UndoCounts): string {
  const head = `Применение отменено: возвращено — ${r.reverted}`;
  if (r.skipped === 0) return head;
  const what = r.skippedFields.length ? undoFieldsText(r.skippedFields) : `полей: ${r.skipped}`;
  return `${head}. Не отменено — после применения изменили вручную: ${what}`;
}
