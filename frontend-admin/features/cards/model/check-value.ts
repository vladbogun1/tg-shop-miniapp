/**
 * «Карточки»: проверка и нормализация одного значения характеристики из ответа ИИ (зеркало бэкендовского
 * `SpecsValidator`, docs/CATALOG-SPECS.md §2). Сервер перепроверяет всё — это нужно для разбора ответа в интерфейсе.
 * По функции на тип характеристики; каждая дописывает замечания в общий список.
 */
import type { CardAttribute } from "./schema";
import type { CardIssue, CardSpecValue } from "./types";
import { fold, joinThousands, matchOption, parseNumberLoose } from "./value";

const MAX_NUMBER = 1e7;

export interface ValueCheck {
  value?: CardSpecValue;
  issues: CardIssue[];
  /** Raw values that are not options (go to proposals). */
  unknownOptions: string[];
}

const shown = (v: unknown) => (typeof v === "string" ? `«${v}»` : JSON.stringify(v));
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function checkNumber(n: number | null, label: string, issues: CardIssue[]): number | null {
  if (n === null) {
    issues.push({ level: "error", text: `${label}не число` });
    return null;
  }
  if (n < 0 || n > MAX_NUMBER) {
    issues.push({ level: "error", text: `${label}число вне 0…10 000 000` });
    return null;
  }
  return n;
}

interface Bounds {
  min: number | null;
  max: number | null;
}

/** Из строки «50–30 000» — первые два числа (одно число → min = max). */
function boundsFromString(raw: string, issues: CardIssue[]): Bounds {
  const nums = (joinThousands(raw).match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));
  if (!nums.length) return { min: null, max: null };
  const min = nums[0];
  const max = nums.length > 1 ? nums[1] : nums[0];
  issues.push({ level: "info", text: `${shown(raw)} → ${min}–${max}` });
  return { min, max };
}

function boundsFromObject(raw: Record<string, unknown>, issues: CardIssue[]): Bounds {
  let min = parseNumberLoose(raw.min);
  let max = parseNumberLoose(raw.max);
  if (typeof raw.min === "string" || typeof raw.max === "string") issues.push({ level: "info", text: `${shown(raw)} → числа` });
  if (min === null && max !== null) min = max;
  if (max === null && min !== null) max = min;
  return { min, max };
}

function rangeBounds(raw: unknown, issues: CardIssue[]): Bounds {
  if (isPlainObject(raw)) return boundsFromObject(raw, issues);
  if (typeof raw === "number") {
    issues.push({ level: "info", text: `одно число → {min: ${raw}, max: ${raw}}` });
    return { min: raw, max: raw };
  }
  if (typeof raw === "string") return boundsFromString(raw, issues);
  return { min: null, max: null };
}

function checkRange(raw: unknown, issues: CardIssue[]): CardSpecValue | undefined {
  const { min, max } = rangeBounds(raw, issues);
  const a = checkNumber(min, "min: ", issues);
  const b = checkNumber(max, "max: ", issues);
  if (a === null || b === null) return undefined;
  if (a > b) {
    issues.push({ level: "error", text: `min ${a} больше max ${b}` });
    return undefined;
  }
  return { min: a, max: b };
}

/** Одно число; диапазон с min = max тоже сойдёт. */
function singleNumber(raw: unknown, issues: CardIssue[]): number | null | undefined {
  if (!isPlainObject(raw)) {
    const n = parseNumberLoose(raw);
    if (typeof raw === "string" && n !== null) issues.push({ level: "info", text: `${shown(raw)} → ${n}` });
    return n;
  }
  const a = parseNumberLoose(raw.min);
  const b = parseNumberLoose(raw.max);
  if (a !== null && a === b) {
    issues.push({ level: "info", text: "диапазон с min = max → число" });
    return a;
  }
  issues.push({ level: "error", text: "диапазон, а нужно одно число" });
  return undefined;
}

function checkNumeric(attr: CardAttribute, raw: unknown, issues: CardIssue[]): CardSpecValue | undefined {
  if (attr.range) return checkRange(raw, issues);
  const n = singleNumber(raw, issues);
  if (n === undefined) return undefined;
  const ok = checkNumber(n, "", issues);
  return ok === null ? undefined : ok;
}

function checkEnum(attr: CardAttribute, raw: unknown, c: ValueCheck): CardSpecValue | undefined {
  const s = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
  if (typeof s !== "string" || !s.trim()) {
    c.issues.push({ level: "error", text: "нужна одна опция-строка" });
    return undefined;
  }
  const v = matchOption(attr, s.trim());
  if (!v) {
    c.unknownOptions.push(s.trim());
    c.issues.push({ level: "error", text: `нет опции ${shown(s)} → в предложения` });
    return undefined;
  }
  if (v !== s) c.issues.push({ level: "info", text: `${shown(s)} → ${v}` });
  return v;
}

function checkMulti(attr: CardAttribute, raw: unknown, c: ValueCheck): CardSpecValue | undefined {
  let arr: unknown[];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string") {
    arr = raw.split(/[,;/]/);
    c.issues.push({ level: "info", text: "строка → список" });
  } else {
    c.issues.push({ level: "error", text: "нужен массив опций" });
    return undefined;
  }
  const out: string[] = [];
  const renamed: string[] = [];
  for (const x of arr) {
    if (typeof x !== "string" || !x.trim()) continue;
    const v = matchOption(attr, x.trim());
    if (!v) c.unknownOptions.push(x.trim());
    else {
      if (v !== x) renamed.push(`${x} → ${v}`);
      if (!out.includes(v)) out.push(v);
    }
  }
  if (renamed.length) c.issues.push({ level: "info", text: renamed.join(", ") });
  if (c.unknownOptions.length) {
    c.issues.push({
      level: out.length ? "warn" : "error",
      text: `нет опций: ${c.unknownOptions.map((u) => `«${u}»`).join(", ")}${out.length ? " — отброшены" : ""}`,
    });
  }
  return out.length ? out : undefined;
}

const YES = ["да", "так", "yes", "true", "1", "есть"];
const NO = ["нет", "ні", "no", "false", "0"];

function checkBool(raw: unknown, issues: CardIssue[]): CardSpecValue | undefined {
  if (typeof raw === "boolean") return raw;
  const s = typeof raw === "string" ? fold(raw) : typeof raw === "number" ? String(raw) : "";
  if (YES.includes(s)) {
    issues.push({ level: "info", text: `${shown(raw)} → да` });
    return true;
  }
  if (NO.includes(s)) {
    issues.push({ level: "info", text: `${shown(raw)} → нет` });
    return false;
  }
  issues.push({ level: "error", text: "нужно true / false" });
  return undefined;
}

function checkText(raw: unknown, issues: CardIssue[]): CardSpecValue | undefined {
  if (typeof raw === "number") {
    issues.push({ level: "info", text: "число → строка" });
    return String(raw);
  }
  if (typeof raw !== "string" || !raw.trim()) {
    issues.push({ level: "error", text: "пустая строка" });
    return undefined;
  }
  const t = raw.trim();
  if (t.length > 255) {
    issues.push({ level: "error", text: "длиннее 255 символов" });
    return undefined;
  }
  return t;
}

function valueOf(attr: CardAttribute, raw: unknown, c: ValueCheck): CardSpecValue | undefined {
  switch (attr.type) {
    case "number":
      return checkNumeric(attr, raw, c.issues);
    case "enum":
      return checkEnum(attr, raw, c);
    case "multi":
      return checkMulti(attr, raw, c);
    case "bool":
      return checkBool(raw, c.issues);
    case "text":
      return checkText(raw, c.issues);
  }
}

/** Validates and normalizes one value; `value` undefined = the field is dropped. */
export function checkValue(attr: CardAttribute, raw: unknown): ValueCheck {
  const c: ValueCheck = { issues: [], unknownOptions: [] };
  const value = valueOf(attr, raw, c);
  return { value, issues: c.issues, unknownOptions: c.unknownOptions };
}
