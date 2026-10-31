/**
 * «Карточки»: проверка одного значения характеристики по схеме (зеркало бэкендовского `SpecsValidator`,
 * docs/CATALOG-SPECS.md §2): сервер перепроверяет всё, это нужно только для разбора ответа в интерфейсе.
 */
import type { CardAttribute } from "./schema";
import { formatNumber } from "@shop/core/money";

export function fold(s: string): string {
  return s.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[\s_\-–—./]+/g, " ").trim();
}

/** Неразрывные пробелы → обычные, «1 200» → «1200» (пробел как разделитель тысяч). */
export function joinThousands(s: string): string {
  return s.replace(/[\u00a0\u202f]/g, " ").replace(/(\d)\s+(?=\d{3}\b)/g, "$1");
}

/** "51 г" → 51, "1 200,5" → 1200.5, "≈ 60" → 60; null if there is no number. */
export function parseNumberLoose(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = joinThousands(v);
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Finds an option by value / label / alias, case- and separator-insensitive. */
export function matchOption(attr: CardAttribute, raw: string): string | null {
  const exact = attr.options.find((o) => o.value === raw);
  if (exact) return exact.value;
  const f = fold(raw);
  if (!f) return null;
  for (const o of attr.options) {
    const names = [o.value, o.labelRu, o.labelUk ?? "", o.labelEn ?? "", ...o.aliases];
    if (names.some((n) => n && fold(n) === f)) return o.value;
  }
  return null;
}

const numberText = (n: number) => formatNumber(n, "ru-RU", { maximumFractionDigits: 3 });

function formatObject(v: object, unit: string): string {
  const o = v as { min?: unknown; max?: unknown };
  if (typeof o.min !== "number" || typeof o.max !== "number") return JSON.stringify(v);
  return (o.min === o.max ? numberText(o.min) : `${numberText(o.min)}–${numberText(o.max)}`) + unit;
}

/** Display of a value with option labels and the unit. */
export function formatValue(attr: CardAttribute | undefined, v: unknown): string {
  if (v === undefined || v === null) return "—";
  const unit = attr?.unit ? ` ${attr.unit}` : "";
  const label = (x: unknown) => attr?.options.find((o) => o.value === x)?.labelRu ?? String(x);
  if (typeof v === "boolean") return v ? "да" : "нет";
  if (typeof v === "number") return numberText(v) + unit;
  if (Array.isArray(v)) return v.length ? v.map(label).join(", ") : "—";
  if (typeof v === "object") return formatObject(v, unit);
  return attr?.type === "enum" ? label(v) : String(v);
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  }
  return JSON.stringify(v);
}

export function sameValue(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}
