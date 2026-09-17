/** Date/time formatting shared by both apps (Russian UI). */

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Compact variant used in chat bubbles and lists. */
export function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** Day label for chat separators: "Сегодня" / "Вчера" / a date. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (startOf(now) - startOf(d)) / 86_400_000;
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
}

/** Relative-ish time label for cards: "только что" / "5 мин" / "3 ч" / a date. */
export function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

/** "#abcd1234" — the first 8 hex chars, which is how orders are referred to everywhere. */
export function shortOrderId(id: string): string {
  return "#" + id.replace(/-/g, "").slice(0, 8);
}
