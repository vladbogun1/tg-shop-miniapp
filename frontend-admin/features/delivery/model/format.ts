/** Числа в формах Новой Почты: граммы, сантиметры ↔ миллиметры, даты без времени, маска ИНН. */
import { formatMoment } from "@shop/core/time";

/** "" / "0" / мусор → null, иначе целое положительное. */
export function intOrNull(raw: string): number | null {
  const n = Math.round(Number(raw.trim().replace(",", ".")));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Целое → текст поля ("" для null). */
export function intText(v: number | null | undefined): string {
  return v == null || v <= 0 ? "" : String(v);
}

const KG = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

/** 1250 г → "1,25 кг"; 300 г → "300 г". */
export function weightText(g: number): string {
  return g >= 1000 ? `${KG.format(g / 1000)} кг` : `${g} г`;
}

export function boxText(l?: number | null, w?: number | null, h?: number | null): string {
  return l && w && h ? `${Math.round(l / 10)}×${Math.round(w / 10)}×${Math.round(h / 10)} см` : "—";
}

/** Миллиметры → сантиметры для поля ("" для пустого). */
export function cmText(mm: number | null | undefined): string {
  return mm ? String(Math.round(mm) / 10) : "";
}

/** Сантиметры из поля → миллиметры; пусто / мусор → null. */
export function toMm(raw: string): number | null {
  const n = parseFloat(raw.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n * 10)) : null;
}

/** Дата без времени из API ("2026-10-25") → "25.10.2026"; полный момент — его дата. */
export function dayText(raw: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  return formatMoment(dateOnly ? `${raw}T00:00:00Z` : raw, { day: "2-digit", month: "2-digit", year: "numeric" }, undefined, dateOnly ? "UTC" : undefined);
}

/** "1234567890" → "•••••••890": ЄДРПОУ/ИНН показываем только последними тремя цифрами. */
export function maskTin(tin: string): string {
  const t = tin.trim();
  return t.length <= 3 ? "•••" : `${"•".repeat(Math.min(7, t.length - 3))}${t.slice(-3)}`;
}
