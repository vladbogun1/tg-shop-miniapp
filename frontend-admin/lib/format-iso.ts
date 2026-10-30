import { formatDateTime } from "@shop/core/time";

/** Время из ISO-строки для подписи; пусто или битая строка — null. */
export function formatIsoOrNull(iso?: string | null): string | null {
  if (!iso) return null;
  if (Number.isNaN(new Date(iso).getTime())) return null;
  return formatDateTime(iso);
}
