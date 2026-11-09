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

// Валюта по краям числа: символ или код. Остальной текст («12 pcs x2») — не число, а не «122».
const MONEY_TOKENS = /^(?:[¥$€₴]|zł|rmb|cny|usd|eur|uah|pln|грн\.?)\s*|\s*(?:[¥$€₴]|zł|rmb|cny|usd|eur|uah|pln|грн\.?)$/gi;

/** Без разделителей тысяч: последний из «.»/«,» — десятичный; один разделитель с ровно тремя цифрами после — тысячи. */
function decimalOf(s: string): string | null {
  const dot = s.lastIndexOf(".");
  const comma = s.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) {
    const dec = dot > comma ? "." : ",";
    const thousands = dec === "." ? "," : ".";
    const [int, frac, ...rest] = s.split(dec);
    if (rest.length || frac.includes(thousands)) return null;
    return `${int.split(thousands).join("")}.${frac}`;
  }
  const sep = dot >= 0 ? "." : comma >= 0 ? "," : null;
  if (!sep) return s;
  const parts = s.split(sep);
  const thousands = parts.length > 2 || (parts[1].length === 3 && /[1-9]/.test(parts[0]));
  if (thousands) return parts.every((p, i) => (i === 0 ? p.length >= 1 && p.length <= 3 : p.length === 3)) ? parts.join("") : null;
  return parts.join(".");
}

/** Число из числа или строки «¥1 234,50» / «$42.50» / «1,234.50» / «10 zł». */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const bare = v.trim().replace(MONEY_TOKENS, "").replace(/[\s  ']/g, "");
  if (!/^-?\d[\d.,]*$/.test(bare)) return null;
  const dec = decimalOf(bare);
  const n = dec == null ? NaN : Number(dec);
  return Number.isFinite(n) ? n : null;
}

const CURRENCY: Record<string, string> = {
  "¥": "CNY", RMB: "CNY", CNY: "CNY", "$": "USD", USD: "USD", "€": "EUR", EUR: "EUR",
  "₴": "UAH", UAH: "UAH", "ГРН": "UAH", "ГРН.": "UAH", PLN: "PLN", "ZŁ": "PLN",
};

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
    title: str(v.title),
  };
  return { doc: lines.length ? doc : null, docNotes: str(v.docNotes), errors, notes: json.notes };
}
