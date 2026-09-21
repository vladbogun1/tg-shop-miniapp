/**
 * Date/time formatting shared by both apps.
 *
 * Every function takes an optional BCP-47 locale and defaults to Russian, so the admin panel — which
 * stays Russian — needs no changes, while the customer app passes whatever language it is currently
 * showing. Without this the dates stayed Russian under a Ukrainian interface.
 *
 * The two functions that contain WORDS ("Сегодня", "5 мин") also take those words as an argument.
 * Formatting belongs here; vocabulary belongs to whoever owns the dictionary.
 */

/** Words used by {@link dayLabel} and {@link timeAgo}; defaults keep the admin panel as it was. */
export interface RelativeLabels {
  today: string;
  yesterday: string;
  justNow: string;
  /** Templates with a `{n}` placeholder, e.g. "{n} мин". */
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

const DEFAULT_LOCALE = "ru-RU";

export function formatDate(iso: string, locale = DEFAULT_LOCALE): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" });
}

export function formatDateTime(iso: string, locale = DEFAULT_LOCALE): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Compact variant used in chat bubbles and lists. */
export function formatShortDateTime(iso: string, locale = DEFAULT_LOCALE): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string, locale = DEFAULT_LOCALE): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/** Day label for chat separators: "today" / "yesterday" / a date. */
export function dayLabel(
  iso: string,
  locale = DEFAULT_LOCALE,
  labels: RelativeLabels = RU_LABELS
): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (startOf(now) - startOf(d)) / 86_400_000;
  if (diff === 0) return labels.today;
  if (diff === 1) return labels.yesterday;
  return d.toLocaleDateString(locale, { day: "2-digit", month: "long" });
}

/** Relative-ish time label for cards: "just now" / "5 min" / "3 h" / a date. */
export function timeAgo(
  iso: string,
  locale = DEFAULT_LOCALE,
  labels: RelativeLabels = RU_LABELS
): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return labels.justNow;
  if (diff < 3600) return labels.minutes.replace("{n}", String(Math.floor(diff / 60)));
  if (diff < 86400) return labels.hours.replace("{n}", String(Math.floor(diff / 3600)));
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

/** "#abcd1234" — the first 8 hex chars, which is how orders are referred to everywhere. */
export function shortOrderId(id: string): string {
  return "#" + id.replace(/-/g, "").slice(0, 8);
}
