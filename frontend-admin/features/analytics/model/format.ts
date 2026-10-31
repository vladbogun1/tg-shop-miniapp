import { formatNumber, toMajor } from "@shop/core/money";
import { formatMoment } from "@shop/core/time";
/**
 * Formatting for the metrics page: money in UAH from kopecks, counts, hours, dates. Bucket and
 * period labels are the backend's calendar days (Europe/Kyiv) and are shown as they come; a moment
 * in time (dateTime) is shown in the browser's time zone, like everywhere else in the admin.
 */

const nf = new Intl.NumberFormat("ru-RU");

/** 12345600 kopecks -> "123 456 ₴". */
export function uah(minor: number | null | undefined): string {
  return `${nf.format(Math.round(toMajor(minor)))} ₴`;
}

/** Exact, with kopecks when there are any: "1 234,50 ₴" (bank fees, small refunds). */
export function uahExact(minor: number | null | undefined): string {
  const v = toMajor(minor);
  const digits = Math.round(minor ?? 0) % 100 === 0 ? 0 : 2;
  return `${formatNumber(v, "ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ₴`;
}

/** Compact for axes and tiles: "123 тыс ₴", "1,2 млн ₴". */
export function uahShort(minor: number | null | undefined): string {
  const v = toMajor(minor);
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${formatNumber((v / 1_000_000), "ru-RU", { maximumFractionDigits: 1 })} млн ₴`;
  if (a >= 10_000) return `${formatNumber(Math.round(v / 1000), "ru-RU")} тыс ₴`;
  return `${nf.format(Math.round(v))} ₴`;
}

export function num(n: number | null | undefined): string {
  return nf.format(n ?? 0);
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return `${formatNumber(n, "ru-RU", { maximumFractionDigits: digits })}%`;
}

/** Hours -> "8 мин" / "5,4 ч" / "3,1 дн". */
export function duration(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} мин`;
  if (h < 48) return `${formatNumber((Math.round(h * 10) / 10), "ru-RU")} ч`;
  return `${formatNumber((Math.round((h / 24) * 10) / 10), "ru-RU")} дн`;
}

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_FULL = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

/** Bucket key -> axis label: "2026-10-04" -> "04.10", "2026-10-04T15" -> "15:00". */
export function bucketLabel(key: string, granularity?: string): string {
  if (!key) return "";
  if (key.includes("T")) return `${key.slice(11, 13)}:00`;
  const [, m, d] = key.split("-");
  if (granularity === "WEEK") return `с ${d}.${m}`;
  return `${d}.${m}`;
}

/** "2026-10" -> "окт 2026" / "октябрь". */
export function monthLabel(ym: string, full = false): string {
  const [y, m] = ym.split("-");
  const i = Number(m) - 1;
  return full ? MONTHS_FULL[i] : `${MONTHS[i]} ${y}`;
}

/** ISO instant -> "04.10 15:30" in the browser's time zone. */
export function dateTime(iso: string): string {
  return formatMoment(iso, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
