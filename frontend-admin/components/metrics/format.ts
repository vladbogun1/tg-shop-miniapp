/** Formatting for the metrics page: money in UAH from kopecks, counts, hours, dates (Europe/Kyiv). */

const nf = new Intl.NumberFormat("ru-RU");

/** 12345600 kopecks -> "123 456 ₴". */
export function uah(minor: number | null | undefined): string {
  return `${nf.format(Math.round((minor ?? 0) / 100))} ₴`;
}

/** Exact, with kopecks when there are any: "1 234,50 ₴" (bank fees, small refunds). */
export function uahExact(minor: number | null | undefined): string {
  const v = (minor ?? 0) / 100;
  const digits = Math.round(minor ?? 0) % 100 === 0 ? 0 : 2;
  return `${v.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ₴`;
}

/** Compact for axes and tiles: "123 тыс ₴", "1,2 млн ₴". */
export function uahShort(minor: number | null | undefined): string {
  const v = (minor ?? 0) / 100;
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₴`;
  if (a >= 10_000) return `${Math.round(v / 1000).toLocaleString("ru-RU")} тыс ₴`;
  return `${nf.format(Math.round(v))} ₴`;
}

export function num(n: number | null | undefined): string {
  return nf.format(n ?? 0);
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: digits })}%`;
}

/** Hours -> "8 мин" / "5,4 ч" / "3,1 дн". */
export function duration(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} мин`;
  if (h < 48) return `${(Math.round(h * 10) / 10).toLocaleString("ru-RU")} ч`;
  return `${(Math.round((h / 24) * 10) / 10).toLocaleString("ru-RU")} дн`;
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

/** ISO instant -> "04.10 15:30" in Kyiv. */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
