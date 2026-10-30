/**
 * Дата и время (docs/ARCHITECTURE-FRONT.md, 2.5, решение владельца В4).
 *
 * Показ — в поясе того, кто смотрит (браузер/телефон: покупатели из Европы и др.). Часовой пояс сюда
 * зашивать не надо; необязательный `timeZone` нужен только там, где пояс задан осознанно (формат фида,
 * дата «в полдень UTC»). Границы бизнес-периодов (дни отчётов, сроки) считает бэкенд по Киеву — фронт их
 * не пересчитывает.
 *
 * Единственное место, где разрешены `new Date()`, `Date.now`, `toLocale*` и `Intl.DateTimeFormat`
 * (ESLint-правила time-*). Тесты подменяют часы через {@link setClock}.
 *
 * Все функции принимают необязательную BCP-47 локаль и по умолчанию русскую: админка осталась русской,
 * покупательские приложения передают текущий язык интерфейса.
 *
 * Две функции со СЛОВАМИ («Сегодня», «5 мин») принимают их аргументом: форматирование живёт здесь,
 * словарь — у владельца словаря.
 */

const DEFAULT_LOCALE = "ru-RU";

let clock: () => number = () => Date.now();

/** Текущий момент в мс. В тестах подменяется {@link setClock}. */
export function nowMs(): number {
  return clock();
}

/** Текущий момент как `Date`. */
export function now(): Date {
  return new Date(clock());
}

/** Подмена часов в тестах; `null` — вернуть настоящие. */
export function setClock(fn: (() => number) | null): void {
  clock = fn ?? (() => Date.now());
}

/** Слова для {@link dayLabel} и {@link timeAgo}; по умолчанию — русские (админка). */
export interface RelativeLabels {
  today: string;
  yesterday: string;
  justNow: string;
  /** Шаблоны с `{n}`, например "{n} мин". */
  minutes: string;
  hours: string;
}

const RU_LABELS: RelativeLabels = {
  today: "Сегодня",
  yesterday: "Вчера",
  justNow: "только что",
  minutes: "{n} мин",
  hours: "{n} ч",
};

function parse(iso: string | number | Date): Date | null {
  const d = iso instanceof Date ? iso : new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Любой формат момента через `Intl`. Пустое/невалидное значение — "" (а не «01.01.1970»: фальшивое
 * «03:00» хуже, чем отсутствие времени). `timeZone` не задан — пояс зрителя.
 */
export function formatMoment(
  iso: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions,
  locale = DEFAULT_LOCALE,
  timeZone?: string,
): string {
  if (iso == null || iso === "") return "";
  const d = parse(iso);
  if (!d) return String(iso);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(d);
}

export function formatDate(iso: string, locale = DEFAULT_LOCALE, timeZone?: string): string {
  return formatMoment(iso, { day: "2-digit", month: "long", year: "numeric" }, locale, timeZone);
}

/** "10 окт." — день и короткий месяц, где год очевиден. */
export function formatDayMonth(iso: string, locale = DEFAULT_LOCALE, timeZone?: string): string {
  return formatMoment(iso, { day: "numeric", month: "short" }, locale, timeZone);
}

export function formatDateTime(iso: string, locale = DEFAULT_LOCALE, timeZone?: string): string {
  return formatMoment(iso, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }, locale, timeZone);
}

/** Компактный вариант для пузырей чата и списков. */
export function formatShortDateTime(iso: string, locale = DEFAULT_LOCALE, timeZone?: string): string {
  return formatMoment(iso, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }, locale, timeZone);
}

export function formatTime(iso: string, locale = DEFAULT_LOCALE, timeZone?: string): string {
  return formatMoment(iso, { hour: "2-digit", minute: "2-digit" }, locale, timeZone);
}

/**
 * Подпись дня для разделителей чата, как в Telegram: «сегодня» / «вчера» / «7 октября», с годом для
 * прошлых лет. Дни — зрителя (пояс браузера).
 */
export function dayLabel(iso: string, locale = DEFAULT_LOCALE, labels: RelativeLabels = RU_LABELS, at: Date = now()): string {
  if (!iso) return "";
  const d = parse(iso);
  if (!d) return iso;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  // Math.round: при переводе часов сутки длятся 23 или 25 часов.
  const diff = Math.round((startOf(at) - startOf(d)) / 86_400_000);
  if (diff === 0) return labels.today;
  if (diff === 1) return labels.yesterday;
  return formatMoment(d, { day: "numeric", month: "long", ...(d.getFullYear() !== at.getFullYear() ? { year: "numeric" } : {}) }, locale);
}

/** Ключ календарного дня зрителя ("2026-9-7") — группировка сообщений чата по дням. */
export function dayKey(iso: string): string {
  const d = parse(iso);
  return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : String(iso);
}

/** Относительное время для карточек: «только что» / «5 мин» / «3 ч» / дата. */
export function timeAgo(iso: string, locale = DEFAULT_LOCALE, labels: RelativeLabels = RU_LABELS): string {
  const d = parse(iso);
  if (!d) return "";
  const diff = (nowMs() - d.getTime()) / 1000;
  if (diff < 60) return labels.justNow;
  if (diff < 3600) return labels.minutes.replace("{n}", String(Math.floor(diff / 60)));
  if (diff < 86400) return labels.hours.replace("{n}", String(Math.floor(diff / 3600)));
  return formatMoment(d, { day: "2-digit", month: "2-digit" }, locale);
}

/**
 * Календарный день `yyyy-MM-dd` момента в ЯВНО заданном поясе — для запросов к API, где граница дня
 * бизнесовая (сутки отчётов считает бэкенд по Киеву), и для форматов фидов. Для показа не использовать.
 */
export function dayInZone(timeZone: string, at: Date = now()): string {
  return formatMoment(at, { year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA", timeZone);
}

/** Части форматированного момента по типу (`{ month: "листопада", day: "10" }`) — для склонения месяца и фидов с фиксированным форматом. */
export function momentParts(at: Date, options: Intl.DateTimeFormatOptions, locale = DEFAULT_LOCALE, timeZone?: string): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat(locale, { ...options, timeZone }).formatToParts(at).map((p) => [p.type, p.value]));
}
