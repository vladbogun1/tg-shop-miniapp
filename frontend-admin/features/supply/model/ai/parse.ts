/** Разбор ответа шага 1 (формат — в `extract-prompt.ts`): JSON → документ поставки + ошибки по строкам. Чистая логика. */
import { extractJson } from "./json";
import type { ExtractedDoc, SourceLine } from "./types";

export interface ParsedExtract {
  doc: ExtractedDoc | null;
  docNotes: string | null;
  errors: string[];
  notes: string[];
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.toLowerCase() !== "null" ? s : null;
}

/** Число из числа или строки «¥1 234,50» / «$42.50». */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = cleaned ? Number(cleaned) : NaN;
  return Number.isFinite(n) ? n : null;
}

const CURRENCY: Record<string, string> = { "¥": "CNY", RMB: "CNY", "$": "USD", "€": "EUR", "₴": "UAH", UAH: "UAH", USD: "USD", EUR: "EUR", CNY: "CNY" };

function currencyOf(v: unknown): string | null {
  const s = str(v)?.toUpperCase();
  return s ? CURRENCY[s] ?? null : null;
}

function lineOf(raw: unknown, i: number, errors: string[]): SourceLine | null {
  if (!isObj(raw)) {
    errors.push(`Строка ${i + 1}: не объект`);
    return null;
  }
  const text = str(raw.text) ?? str(raw.en);
  const qty = num(raw.qty);
  if (!text) {
    errors.push(`Строка ${i + 1}: нет названия ("text")`);
    return null;
  }
  if (qty == null || qty < 1 || !Number.isInteger(qty)) {
    errors.push(`Строка ${i + 1} («${text.slice(0, 40)}»): количество должно быть целым от 1`);
    return null;
  }
  return {
    id: `L${i + 1}`,
    text,
    variant: str(raw.variant),
    en: str(raw.en),
    brand: str(raw.brand),
    model: str(raw.model),
    color: str(raw.color),
    qty,
    unitPrice: num(raw.unitPrice),
    lineTotal: num(raw.lineTotal),
    notes: str(raw.notes),
  };
}

export function parseExtract(answer: string): ParsedExtract {
  const json = extractJson(answer);
  if (json.error) return { doc: null, docNotes: null, errors: [json.error], notes: [] };
  const v = json.value;
  if (!isObj(v) || !Array.isArray(v.lines)) {
    return { doc: null, docNotes: null, errors: ['Нет списка строк "lines"'], notes: json.notes };
  }
  const errors: string[] = [];
  const lines = v.lines.map((l, i) => lineOf(l, i, errors)).filter((l): l is SourceLine => l != null);
  if (lines.length === 0) errors.push("Ни одной строки товара");
  const doc: ExtractedDoc = {
    supplier: str(v.supplier),
    currency: currencyOf(v.currency),
    docNo: str(v.docNo),
    docDate: str(v.docDate),
    total: num(v.total),
    lines,
  };
  return { doc: lines.length ? doc : null, docNotes: str(v.docNotes), errors, notes: json.notes };
}
