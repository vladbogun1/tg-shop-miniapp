/**
 * «Карточки»: parsing of the AI answer and its validation against the catalog schema.
 * Pure functions, no React and no "@/" imports (node can run it too). The format it reads is
 * described in `card-prompt.ts`; the rules mirror the backend `SpecsValidator`
 * (docs/CATALOG-SPECS.md §2): the server re-validates everything, this is only for the review UX.
 */
import {
  attributesForCategory,
  categoryOf,
  isLeafCategory,
  type CardAttribute,
  type CardItem,
  type CardSchema,
} from "./card-prompt";
import { checkTranslation, wordDiff, type DiffPart } from "./translation-check";

export { wordDiff, type DiffPart };

// ============================================================================
// Parsing
// ============================================================================

export interface ParsedCardAnswer {
  /** Answer id (lower-case, as written) → raw value. */
  entries: Map<string, unknown>;
  errors: string[];
  notes: string[];
  /** Ids present more than once with different content — excluded. */
  duplicates: Set<string>;
}

/** Blocks of JSON to read: fenced code blocks if any, else the outermost {…}. */
function candidateBlocks(text: string): string[] {
  const blocks: string[] = [];
  const fence = /```[^\n`]*\n?([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text))) {
    if (m[1].includes("{")) blocks.push(m[1]);
  }
  if (blocks.length) return blocks;
  const open = text.indexOf("```");
  const body = open >= 0 ? text.slice(text.indexOf("\n", open) + 1) : text;
  const a = body.indexOf("{");
  const b = body.lastIndexOf("}");
  // Unclosed fence: keep the tail too — the parser cuts it at the last finished product.
  if (a >= 0 && open >= 0) blocks.push(body.slice(a));
  else if (a >= 0 && b > a) blocks.push(body.slice(a, b + 1));
  return blocks;
}

/**
 * Answer cut off mid-product: drop the unfinished product and close the object, so the finished
 * ones still count. Only a top-level `"pXXXX": {` boundary is used.
 */
function cutToLastProduct(block: string): string | null {
  const re = /,\s*"p[0-9a-f]{6,32}"\s*:\s*\{/gi;
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) last = m.index;
  if (last < 0) return null;
  return block.slice(0, last) + "\n}";
}

function tryParse(block: string, notes: Set<string>): { value?: unknown; error?: string } {
  const noCommas = (s: string) => s.replace(/,(\s*[}\]])/g, "$1");
  const smart = (s: string) => s.replace(/[“”„‟″]/g, '"');
  const attempts: { text: string; note?: string }[] = [
    { text: block },
    { text: noCommas(block), note: "убраны висячие запятые" },
    { text: noCommas(smart(block)), note: "«умные» кавычки заменены на обычные — проверьте тексты с кавычками" },
  ];
  const cut = cutToLastProduct(block);
  if (cut) attempts.push({ text: noCommas(smart(cut)), note: "ответ оборван — взяты только законченные товары, попросите ИИ продолжить" });
  let firstError = "";
  for (const at of attempts) {
    try {
      const value = JSON.parse(at.text);
      if (at.note) notes.add(at.note);
      return { value };
    } catch (e) {
      if (!firstError) firstError = e instanceof Error ? e.message : String(e);
    }
  }
  return { error: firstError };
}

const ID_KEY = /"(p[0-9a-f]{6,32})"\s*:\s*\{/gi;

export function parseCardAnswer(raw: string): ParsedCardAnswer {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const entries = new Map<string, unknown>();
  const errors: string[] = [];
  const notes = new Set<string>();
  const duplicates = new Set<string>();
  if (!text.trim()) return { entries, errors, notes: [], duplicates };

  const blocks = candidateBlocks(text);
  if (!blocks.length) {
    errors.push("В ответе не найден JSON-объект в блоке кода.");
    return { entries, errors, notes: [], duplicates };
  }
  if (blocks.length > 1) notes.add(`найдено блоков кода: ${blocks.length} — объединены`);

  const seen = new Map<string, string>();
  blocks.forEach((block, bi) => {
    const label = blocks.length > 1 ? `Блок ${bi + 1}: ` : "";
    const counts = new Map<string, number>();
    for (const m of block.matchAll(ID_KEY)) {
      const id = m[1].toLowerCase();
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    counts.forEach((n, id) => n > 1 && duplicates.add(id));

    const { value, error } = tryParse(block, notes);
    if (error !== undefined) {
      errors.push(`${label}JSON не читается (${error}). Попросите ИИ повторить ответ строго одним блоком \`\`\`json.`);
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${label}ожидался JSON-объект { "p…": { "specs": … } }.`);
      return;
    }
    for (const [rawKey, v] of Object.entries(value as Record<string, unknown>)) {
      const id = rawKey.trim().toLowerCase();
      const serialized = JSON.stringify(v);
      const prev = seen.get(id);
      if (prev !== undefined) {
        if (prev !== serialized) duplicates.add(id);
        continue;
      }
      seen.set(id, serialized);
      entries.set(id, v);
    }
  });
  return { entries, errors, notes: Array.from(notes), duplicates };
}

// ============================================================================
// Value validation (mirror of SpecsValidator)
// ============================================================================

export type Level = "ok" | "warn" | "error";

export interface CardIssue {
  level: "error" | "warn" | "info";
  text: string;
}

export type CardSpecValue = number | { min: number; max: number } | string | string[] | boolean;

const MAX_NUMBER = 1e7;

function fold(s: string): string {
  return s.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[\s_\-–—./]+/g, " ").trim();
}

/** "51 г" → 51, "1 200,5" → 1200.5, "≈ 60" → 60; null if there is no number. */
export function parseNumberLoose(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[  ]/g, " ").replace(/(\d)\s+(?=\d{3}\b)/g, "$1");
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

export interface ValueCheck {
  value?: CardSpecValue;
  issues: CardIssue[];
  /** Raw values that are not options (go to proposals). */
  unknownOptions: string[];
}

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

/** Validates and normalizes one value; `value` undefined = the field is dropped. */
export function checkValue(attr: CardAttribute, raw: unknown): ValueCheck {
  const issues: CardIssue[] = [];
  const unknownOptions: string[] = [];
  const done = (value?: CardSpecValue): ValueCheck => ({ value, issues, unknownOptions });
  const shown = (v: unknown) => (typeof v === "string" ? `«${v}»` : JSON.stringify(v));

  switch (attr.type) {
    case "number": {
      if (attr.range) {
        let min: number | null = null;
        let max: number | null = null;
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          const o = raw as Record<string, unknown>;
          min = parseNumberLoose(o.min);
          max = parseNumberLoose(o.max);
          if (typeof o.min === "string" || typeof o.max === "string") issues.push({ level: "info", text: `${shown(raw)} → числа` });
          if (min === null && max !== null) min = max;
          if (max === null && min !== null) max = min;
        } else if (typeof raw === "number") {
          min = max = raw;
          issues.push({ level: "info", text: `одно число → {min: ${raw}, max: ${raw}}` });
        } else if (typeof raw === "string") {
          const nums = (raw.replace(/[  ]/g, " ").replace(/(\d)\s+(?=\d{3}\b)/g, "$1").match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) =>
            Number(x.replace(",", "."))
          );
          if (nums.length) {
            min = nums[0];
            max = nums.length > 1 ? nums[1] : nums[0];
            issues.push({ level: "info", text: `${shown(raw)} → ${min}–${max}` });
          }
        }
        const a = checkNumber(min, "min: ", issues);
        const b = checkNumber(max, "max: ", issues);
        if (a === null || b === null) return done();
        if (a > b) {
          issues.push({ level: "error", text: `min ${a} больше max ${b}` });
          return done();
        }
        return done({ min: a, max: b });
      }
      let n: number | null;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const o = raw as Record<string, unknown>;
        const a = parseNumberLoose(o.min);
        const b = parseNumberLoose(o.max);
        if (a !== null && a === b) {
          n = a;
          issues.push({ level: "info", text: "диапазон с min = max → число" });
        } else {
          issues.push({ level: "error", text: "диапазон, а нужно одно число" });
          return done();
        }
      } else {
        n = parseNumberLoose(raw);
        if (typeof raw === "string" && n !== null) issues.push({ level: "info", text: `${shown(raw)} → ${n}` });
      }
      const ok = checkNumber(n, "", issues);
      return ok === null ? done() : done(ok);
    }
    case "enum": {
      let s = raw;
      if (Array.isArray(s) && s.length === 1) s = s[0];
      if (typeof s !== "string" || !s.trim()) {
        issues.push({ level: "error", text: "нужна одна опция-строка" });
        return done();
      }
      const v = matchOption(attr, s.trim());
      if (!v) {
        unknownOptions.push(s.trim());
        issues.push({ level: "error", text: `нет опции ${shown(s)} → в предложения` });
        return done();
      }
      if (v !== s) issues.push({ level: "info", text: `${shown(s)} → ${v}` });
      return done(v);
    }
    case "multi": {
      let arr: unknown[];
      if (Array.isArray(raw)) arr = raw;
      else if (typeof raw === "string") {
        arr = raw.split(/[,;/]/);
        issues.push({ level: "info", text: "строка → список" });
      } else {
        issues.push({ level: "error", text: "нужен массив опций" });
        return done();
      }
      const out: string[] = [];
      const renamed: string[] = [];
      for (const x of arr) {
        if (typeof x !== "string" || !x.trim()) continue;
        const v = matchOption(attr, x.trim());
        if (!v) unknownOptions.push(x.trim());
        else {
          if (v !== x) renamed.push(`${x} → ${v}`);
          if (!out.includes(v)) out.push(v);
        }
      }
      if (renamed.length) issues.push({ level: "info", text: renamed.join(", ") });
      if (unknownOptions.length) {
        issues.push({
          level: out.length ? "warn" : "error",
          text: `нет опций: ${unknownOptions.map((u) => `«${u}»`).join(", ")}${out.length ? " — отброшены" : ""}`,
        });
      }
      return out.length ? done(out) : done();
    }
    case "bool": {
      if (typeof raw === "boolean") return done(raw);
      const s = typeof raw === "string" ? fold(raw) : typeof raw === "number" ? String(raw) : "";
      if (["да", "так", "yes", "true", "1", "есть"].includes(s)) {
        issues.push({ level: "info", text: `${shown(raw)} → да` });
        return done(true);
      }
      if (["нет", "ні", "no", "false", "0"].includes(s)) {
        issues.push({ level: "info", text: `${shown(raw)} → нет` });
        return done(false);
      }
      issues.push({ level: "error", text: "нужно true / false" });
      return done();
    }
    case "text": {
      if (typeof raw === "number") {
        issues.push({ level: "info", text: "число → строка" });
        return done(String(raw));
      }
      if (typeof raw !== "string" || !raw.trim()) {
        issues.push({ level: "error", text: "пустая строка" });
        return done();
      }
      const t = raw.trim();
      if (t.length > 255) {
        issues.push({ level: "error", text: "длиннее 255 символов" });
        return done();
      }
      return done(t);
    }
  }
}

/** Display of a value with option labels and the unit. */
export function formatValue(attr: CardAttribute | undefined, v: unknown): string {
  if (v === undefined || v === null) return "—";
  const unit = attr?.unit ? ` ${attr.unit}` : "";
  const label = (x: unknown) => attr?.options.find((o) => o.value === x)?.labelRu ?? String(x);
  const nf = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
  if (typeof v === "boolean") return v ? "да" : "нет";
  if (typeof v === "number") return nf(v) + unit;
  if (Array.isArray(v)) return v.length ? v.map(label).join(", ") : "—";
  if (typeof v === "object") {
    const o = v as { min?: unknown; max?: unknown };
    if (typeof o.min === "number" && typeof o.max === "number") return (o.min === o.max ? nf(o.min) : `${nf(o.min)}–${nf(o.max)}`) + unit;
    return JSON.stringify(v);
  }
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

// ============================================================================
// Review
// ============================================================================

export interface Proposal {
  key: string;
  value: string;
  why: string | null;
  /** The attribute it refers to (in the target category), if it exists. */
  attr: CardAttribute | null;
  /** Came from the validator (an option the AI put into specs anyway). */
  auto?: boolean;
}

export interface FieldReview {
  key: string;
  attr: CardAttribute | null;
  label: string;
  raw: unknown;
  /** Normalized value; undefined = dropped (error). */
  value?: CardSpecValue;
  before: unknown;
  changed: boolean;
  confidence: number | null;
  /** Source url of this value, when the AI named one ("field_sources"). */
  src: string | null;
  issues: CardIssue[];
  level: Level;
  /** Default of the field checkbox. */
  preselect: boolean;
}

export interface DescriptionReview {
  from: string;
  to: string;
  changed: boolean;
  issues: CardIssue[];
  level: Level;
}

export type TextField = "title" | "description" | "conditionNote";
export type TextLang = "ru" | "uk" | "en";
export const TEXT_FIELDS: TextField[] = ["title", "description", "conditionNote"];
export const TEXT_LABEL: Record<TextField, string> = {
  title: "Название",
  description: "Описание",
  conditionNote: "Причина уценки / состояние",
};

/**
 * One text of the card in three languages. Russian is the source: the import changes it (title,
 * description; the condition note only gets translations), uk/en are saved as translations of the
 * FINAL Russian text.
 */
export interface TextReview {
  field: TextField;
  /** Current Russian text in the database. */
  from: string;
  ru: string;
  uk: string;
  en: string;
  /** The Russian text the AI translated (its answer, before the admin's inline edits). */
  aiRu: string;
  /** Russian differs from the database (always false for the condition note). */
  changed: boolean;
  issues: Record<TextLang, CardIssue[]>;
  level: Level;
}

export interface ChangeReview {
  from: string | null;
  to: string;
  valid: boolean;
  issues: CardIssue[];
}

export interface ProductReview {
  /** Answer id ("p0a1b2c3d"). */
  id: string;
  item: CardItem;
  /** Product-level problems. */
  issues: CardIssue[];
  level: Level;
  category: ChangeReview | null;
  brand: ChangeReview | null;
  /** Category the fields were validated against. */
  targetCategory: string | null;
  fields: FieldReview[];
  /** Title / description / condition note in ru·uk·en (only what the answer touches). */
  texts: Partial<Record<TextField, TextReview>>;
  overall: number | null;
  sources: string[];
  notes: string | null;
  proposals: Proposal[];
  model: string | null;
}

export interface CardReview {
  products: ProductReview[];
  /** Answer ids that match no product. */
  unknown: string[];
  /** Entries that could not be used at all. */
  invalid: { id: string; problems: string[] }[];
}

export function levelOf(issues: { level: string }[]): Level {
  if (issues.some((i) => i.level === "error")) return "error";
  if (issues.some((i) => i.level === "warn")) return "warn";
  return "ok";
}

function confidenceOf(raw: unknown, issues: CardIssue[], what: string): number | null {
  if (raw === undefined || raw === null) return null;
  const n = parseNumberLoose(raw);
  if (n === null) {
    issues.push({ level: "warn", text: `${what}: уверенность не число` });
    return null;
  }
  // 0..1 scale ("0.92") → percent.
  const pct = n > 0 && n <= 1 && String(raw).includes(".") ? Math.round(n * 100) : Math.round(n);
  if (pct < 0 || pct > 100) {
    issues.push({ level: "info", text: `${what}: уверенность ${n} приведена к 0…100` });
    return Math.max(0, Math.min(100, pct));
  }
  return pct;
}

/** Remarks the new description must keep (condition, defects, bundle, sizes). */
const REMARKS: { re: RegExp; label: string }[] = [
  { re: /уцен[её]?н|уценк/i, label: "уценка" },
  { re: /(?<![а-яё])б\s*[/.]\s*у(?![а-яё])|(?<![а-яё])бу(?![а-яё])|бывш|был[аио]? в (?:использовании|употреблении)/i, label: "б/у" },
  { re: /дефект|брак/i, label: "дефект" },
  { re: /царапин|потёрт|потерт|скол|потертост/i, label: "следы использования" },
  { re: /вскрыт|открыт(?:ая|ой) (?:упаковк|пачк|коробк)|без (?:коробки|упаковки)|повреждён|поврежден|мят(?:ая|ой) (?:коробк|упаковк)/i, label: "упаковка" },
  { re: /витрин/i, label: "витринный" },
  { re: /комплект|в наборе|в коробке/i, label: "комплектация" },
  { re: /размер(?:ы|ная сетка)?\s*(?:одежды|[SMLX]{1,3}\b)|\b[2-4]?X{0,3}L\b/i, label: "размер" },
  { re: /гаранти/i, label: "гарантия" },
];

const SPEC_LINE = /^\s*[•\-–—*·]\s*[^:\n]{1,40}:/;
const NUMBER = /\d+(?:[.,]\d+)?/g;

function numbersOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of text.split("\n")) {
    if (SPEC_LINE.test(line)) continue; // "• Вес: 51 г" moves into specs on purpose
    for (const m of line.replace(/(\d)[\s  ]+(?=\d{3}\b)/g, "$1").match(NUMBER) ?? []) out.add(m.replace(",", "."));
  }
  return out;
}

function specNumbers(specs: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "number") out.add(String(v));
    else if (v && typeof v === "object" && !Array.isArray(v)) Object.values(v).forEach(add);
    else if (typeof v === "string") for (const m of v.match(NUMBER) ?? []) out.add(m.replace(",", "."));
  };
  Object.values(specs).forEach(add);
  return out;
}

export function checkDescription(item: CardItem, to: string, newSpecs: Record<string, unknown>): DescriptionReview {
  const from = (item.description ?? "").replace(/\r\n?/g, "\n");
  const text = to.replace(/\r\n?/g, "\n").trim();
  const issues: CardIssue[] = [];
  const changed = text !== from.trim();
  if (changed) {
    const lostRemarks = REMARKS.filter((r) => r.re.test(from) && !r.re.test(text)).map((r) => r.label);
    if (lostRemarks.length) issues.push({ level: "warn", text: `пропала оговорка: ${lostRemarks.join(", ")}` });
    const cond = String(item.condition ?? "NEW").toUpperCase();
    if (cond !== "NEW" && !REMARKS[0].re.test(text) && !REMARKS[1].re.test(text) && !/состояни/i.test(text)) {
      issues.push({ level: "warn", text: cond === "USED" ? "товар б/у — в тексте об этом ни слова" : "товар уценён — в тексте об этом ни слова" });
    }
    const known = new Set([...specNumbers(newSpecs), ...specNumbers(item.specs ?? {})]);
    const after = numbersOf(text);
    const lost = [...numbersOf(from)].filter((n) => !after.has(n) && !known.has(n));
    if (lost.length) issues.push({ level: "warn", text: `пропали числа: ${lost.slice(0, 6).join(", ")}` });
    if (/^\s*[•\-*]\s*[^:\n]{1,40}:/m.test(text)) issues.push({ level: "warn", text: "в описании список «Ключ: значение» — характеристики должны быть в таблице" });
    if (text.length > 2500) issues.push({ level: "warn", text: `длинный текст (${text.length} симв.)` });
    if (!text) issues.push({ level: "error", text: "пусто" });
  }
  return { from, to: text, changed, issues, level: levelOf(issues) };
}

function stringList(v: unknown): string[] {
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? String((x as Record<string, unknown>).url ?? "") : ""))
    .map((s) => s.trim())
    .filter(Boolean);
}

function langTexts(v: unknown): Partial<Record<TextLang, string>> | null {
  const clean = (x: string) => x.replace(/\r\n?/g, "\n").trim();
  if (typeof v === "string") return v.trim() ? { ru: clean(v) } : null;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Partial<Record<TextLang, string>> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const l = k.trim().toLowerCase();
    const lang: TextLang | null = l === "ru" ? "ru" : l === "uk" || l === "ua" ? "uk" : l === "en" ? "en" : null;
    if (lang && typeof val === "string") out[lang] = clean(val);
  }
  return Object.keys(out).length ? out : null;
}

/** Russian that the uk/en of this text must be the translation of. */
export function finalRu(t: TextReview): string {
  return t.field === "conditionNote" ? t.from : t.ru;
}

/** (Re)validates one text after the answer or an inline edit. */
export function checkText(t: TextReview, item: CardItem, specs: Record<string, unknown>): TextReview {
  const issues: Record<TextLang, CardIssue[]> = { ru: [], uk: [], en: [] };
  const changed = t.field !== "conditionNote" && t.ru.trim() !== t.from.trim();
  if (t.field === "title") {
    if (!t.ru.trim()) issues.ru.push({ level: "error", text: "пустое название" });
    else if (t.ru.length > 255) issues.ru.push({ level: "error", text: "длиннее 255 символов" });
    else if (changed) issues.ru.push({ level: "warn", text: "переименование" });
  } else if (t.field === "description") {
    if (changed) issues.ru.push(...checkDescription(item, t.ru, specs).issues);
  } else if (t.aiRu.trim() && t.aiRu.trim() !== t.from.trim()) {
    issues.ru.push({ level: "info", text: "ИИ поправил русский текст причины — он не меняется, сохранится только перевод" });
  }
  const source = finalRu(t);
  const translatedFrom = t.field === "conditionNote" ? t.aiRu || t.from : t.aiRu;
  for (const l of ["uk", "en"] as const) {
    const text = t[l];
    if (!text.trim()) {
      if (source.trim()) issues[l].push({ level: "warn", text: "нет перевода — не сохранится" });
      continue;
    }
    issues[l].push(...checkTranslation(source, l, text).map((i) => ({ level: i.level, text: i.text })));
    if (translatedFrom.trim() !== source.trim()) issues[l].push({ level: "warn", text: "перевод сделан до вашей правки русского — проверьте" });
  }
  return { ...t, changed, issues, level: levelOf([...issues.ru, ...issues.uk, ...issues.en]) };
}

function validSpecsOf(fields: FieldReview[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f.value !== undefined) out[f.key] = f.value;
  return out;
}

/** Product level from all its parts (after the answer or an inline text edit). */
export function productLevel(r: Omit<ProductReview, "level">): Level {
  const texts = Object.values(r.texts) as TextReview[];
  const usable =
    r.fields.some((f) => f.level !== "error") ||
    texts.some((t) => t.changed || !!t.uk.trim() || !!t.en.trim()) ||
    !!r.category?.valid ||
    !!r.brand;
  if (!usable || r.issues.some((i) => i.level === "error")) return "error";
  const all = [
    ...r.issues,
    ...(r.category?.issues.filter((i) => i.level !== "error") ?? []),
    ...(r.category && !r.category.valid ? [{ level: "warn" as const, text: "" }] : []),
    ...(r.brand?.issues ?? []),
    ...(r.fields.some((f) => f.level === "warn") ? [{ level: "warn" as const, text: "" }] : []),
    // A broken text or translation is simply not saved — the product stays sendable.
    ...(texts.some((t) => t.level !== "ok") ? [{ level: "warn" as const, text: "" }] : []),
  ];
  return levelOf(all);
}

/** Inline edit of one language of one text. */
export function editText(r: ProductReview, field: TextField, lang: TextLang, value: string): ProductReview {
  const t = r.texts[field];
  if (!t) return r;
  const next = checkText({ ...t, [lang]: value }, r.item, validSpecsOf(r.fields));
  const out = { ...r, texts: { ...r.texts, [field]: next } };
  return { ...out, level: productLevel(out) };
}

export interface ReviewContext {
  schema: CardSchema;
  /** Every product the screen knows (ids must match `assignCardIds` over the same set). */
  items: CardItem[];
  /** UUID → answer id. */
  ids: Map<string, string>;
}

/** Answer id → product; tolerant to a lost "p", a full UUID or a prefix the AI shortened/extended. */
function resolveId(id: string, byPid: Map<string, CardItem>, items: CardItem[]): CardItem | null {
  const direct = byPid.get(id);
  if (direct) return direct;
  const hex = id.replace(/^p/, "").replace(/-/g, "");
  if (!/^[0-9a-f]{6,32}$/.test(hex)) return null;
  const hits = items.filter((it) => {
    const h = it.id.replace(/-/g, "").toLowerCase();
    return h.startsWith(hex) || hex.startsWith(h.slice(0, Math.max(8, hex.length)));
  });
  return hits.length === 1 ? hits[0] : null;
}

export function reviewProduct(id: string, item: CardItem, raw: unknown, schema: CardSchema): ProductReview | { problems: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { problems: ["значение не объект { specs, confidence, … }"] };
  const e = raw as Record<string, unknown>;
  const issues: CardIssue[] = [];

  // ---- category ----
  const currentCat = item.categorySlug ?? null;
  let targetCategory = currentCat;
  let category: ChangeReview | null = null;
  const catRaw = typeof e.category === "string" ? e.category.trim() : typeof e.categorySlug === "string" ? e.categorySlug.trim() : "";
  if (catRaw && catRaw !== currentCat) {
    const ci: CardIssue[] = [];
    const exists = !!categoryOf(schema, catRaw);
    const leaf = exists && isLeafCategory(schema, catRaw);
    if (!exists) ci.push({ level: "error", text: `нет категории «${catRaw}» — не применится` });
    else if (!leaf) ci.push({ level: "error", text: `«${catRaw}» не лист — не применится` });
    else ci.push({ level: "warn", text: "смена категории" });
    category = { from: currentCat, to: catRaw, valid: leaf, issues: ci };
    if (leaf) targetCategory = catRaw;
  }

  // ---- brand ----
  let brand: ChangeReview | null = null;
  const brandRaw = typeof e.brand === "string" ? e.brand.trim() : "";
  const curBrand = (item.brand ?? "").trim();
  if (brandRaw && brandRaw.toLocaleLowerCase() !== curBrand.toLocaleLowerCase()) {
    brand = {
      from: curBrand || null,
      to: brandRaw,
      valid: brandRaw.length <= 128,
      issues: [{ level: "warn", text: curBrand ? "смена бренда" : "новый бренд" }],
    };
  } else if (brandRaw && brandRaw !== curBrand) {
    brand = { from: curBrand || null, to: brandRaw, valid: true, issues: [{ level: "info", text: "другой регистр" }] };
  }

  // ---- fields ----
  const attrs = attributesForCategory(schema, targetCategory);
  const byKey = new Map(attrs.map((a) => [a.key, a]));
  const specsRaw = e.specs && typeof e.specs === "object" && !Array.isArray(e.specs) ? (e.specs as Record<string, unknown>) : {};
  if (e.specs !== undefined && (typeof e.specs !== "object" || Array.isArray(e.specs))) issues.push({ level: "warn", text: "«specs» не объект — пропущено" });
  const confRaw = e.confidence && typeof e.confidence === "object" && !Array.isArray(e.confidence) ? (e.confidence as Record<string, unknown>) : {};
  const srcRaw = e.field_sources ?? e.fieldSources;
  const srcOf = (key: string): string | null => {
    const v = srcRaw && typeof srcRaw === "object" && !Array.isArray(srcRaw) ? (srcRaw as Record<string, unknown>)[key] : null;
    return typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim()) ? v.trim() : null;
  };
  const fields: FieldReview[] = [];
  const proposals: Proposal[] = [];
  const before = item.specs ?? {};
  for (const [rawKey, rawVal] of Object.entries(specsRaw)) {
    const key = rawKey.trim();
    if (rawVal === null || rawVal === undefined || rawVal === "") continue; // "unknown" → omitted
    const attr = byKey.get(key) ?? null;
    const fi: CardIssue[] = [];
    const confidence = confidenceOf(confRaw[key] ?? confRaw[rawKey], fi, "поле");
    if (!attr) {
      fi.push({ level: "error", text: targetCategory ? "нет такого ключа в схеме категории" : "нет такого ключа (у товара нет категории)" });
      fields.push({ key, attr: null, label: key, raw: rawVal, before: before[key], changed: true, confidence, src: null, issues: fi, level: "error", preselect: false });
      continue;
    }
    const vc = checkValue(attr, rawVal);
    fi.push(...vc.issues);
    for (const u of vc.unknownOptions) proposals.push({ key, value: u, why: "ИИ указал значение не из списка", attr, auto: true });
    if (vc.value !== undefined) {
      if (confidence === null) fi.push({ level: "warn", text: "нет уверенности" });
      else if (confidence < 40) fi.push({ level: "warn", text: `уверенность ${confidence} % — догадка` });
      else if (confidence < 60) fi.push({ level: "warn", text: `уверенность ${confidence} %` });
    }
    const level = vc.value === undefined ? "error" : levelOf(fi);
    const changed = vc.value === undefined || !sameValue(vc.value, before[key]);
    fields.push({
      key,
      attr,
      label: attr.labelRu,
      raw: rawVal,
      value: vc.value,
      before: before[key],
      changed,
      confidence,
      src: srcOf(key),
      issues: fi,
      level,
      preselect: level !== "error" && (confidence === null || confidence >= 40),
    });
  }
  // Order as in the schema, unknown keys last.
  const order = new Map(attrs.map((a, i) => [a.key, i]));
  fields.sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
  const errFields = fields.filter((f) => f.level === "error").length;
  if (errFields) issues.push({ level: "warn", text: `полей отброшено: ${errFields}` });

  // ---- proposals from the AI ----
  if (Array.isArray(e.proposals)) {
    for (const p of e.proposals) {
      if (!p || typeof p !== "object") continue;
      const o = p as Record<string, unknown>;
      const key = typeof o.key === "string" ? o.key.trim() : "";
      const value = typeof o.value === "string" ? o.value.trim() : typeof o.value === "number" ? String(o.value) : "";
      if (!key || !value) continue;
      if (proposals.some((x) => x.key === key && x.value.toLocaleLowerCase() === value.toLocaleLowerCase())) continue;
      proposals.push({ key, value, why: typeof o.why === "string" ? o.why : null, attr: byKey.get(key) ?? null });
    }
  }
  if (proposals.length) issues.push({ level: "warn", text: `предложений новых опций: ${proposals.length}` });

  // ---- texts (ru + translations) ----
  const validSpecs = validSpecsOf(fields);
  const texts: Partial<Record<TextField, TextReview>> = {};
  const current: Record<TextField, string> = {
    title: (item.title ?? "").trim(),
    description: (item.description ?? "").replace(/\r\n?/g, "\n").trim(),
    conditionNote: (item.conditionNote ?? "").trim(),
  };
  const rawTexts: Record<TextField, unknown> = { title: e.title, description: e.description, conditionNote: e.conditionNote ?? e.condition_note };
  for (const field of TEXT_FIELDS) {
    const lt = langTexts(rawTexts[field]);
    if (!lt) continue;
    if (field === "conditionNote" && !current.conditionNote) continue; // nothing to translate
    const draft: TextReview = {
      field,
      from: current[field],
      ru: field === "conditionNote" ? current.conditionNote : lt.ru ?? current[field],
      uk: lt.uk ?? "",
      en: lt.en ?? "",
      aiRu: lt.ru ?? current[field],
      changed: false,
      issues: { ru: [], uk: [], en: [] },
      level: "ok",
    };
    const checked = checkText(draft, item, validSpecs);
    if (!checked.changed && !checked.uk && !checked.en) continue;
    texts[field] = checked;
  }

  // ---- overall ----
  const overall = confidenceOf(e.overall, issues, "общая");
  if (overall === null) issues.push({ level: "warn", text: "нет общей уверенности" });
  else if (overall < 60) issues.push({ level: "warn", text: `общая уверенность ${overall} %` });

  const sources = stringList(e.sources).filter((s) => /^https?:\/\//i.test(s));
  const notes = typeof e.notes === "string" && e.notes.trim() ? e.notes.trim() : null;
  const model = typeof e.model === "string" && e.model.trim() ? e.model.trim() : null;

  const r: Omit<ProductReview, "level"> = {
    id,
    item,
    issues,
    category,
    brand,
    targetCategory,
    fields,
    texts,
    overall,
    sources,
    notes,
    proposals,
    model,
  };
  const level = productLevel(r);
  if (level === "error" && !issues.some((i) => i.level === "error")) {
    issues.push({ level: "error", text: "нечего применить: нет ни одного корректного поля или текста" });
  }
  return { ...r, level };
}

export function buildCardReview(parsed: ParsedCardAnswer, ctx: ReviewContext): CardReview {
  const byPid = new Map<string, CardItem>();
  for (const it of ctx.items) {
    const pid = ctx.ids.get(it.id);
    if (pid) byPid.set(pid, it);
  }
  const products: ProductReview[] = [];
  const unknown: string[] = [];
  const invalid: { id: string; problems: string[] }[] = [];
  const used = new Set<string>();
  parsed.entries.forEach((raw, id) => {
    const item = resolveId(id, byPid, ctx.items);
    if (!item) {
      unknown.push(id);
      return;
    }
    const pid = ctx.ids.get(item.id) ?? id;
    if (parsed.duplicates.has(id) || used.has(item.id)) {
      invalid.push({ id, problems: ["товар встречается в ответе несколько раз"] });
      return;
    }
    used.add(item.id);
    const r = reviewProduct(pid, item, raw, ctx.schema);
    if ("problems" in r) invalid.push({ id, problems: r.problems });
    else products.push(r);
  });
  return { products, unknown, invalid };
}

/** Confidence → colour token. */
export function confidenceColor(c: number | null | undefined): string {
  if (c === null || c === undefined) return "var(--text-faint)";
  if (c >= 80) return "var(--ok)";
  if (c >= 60) return "color-mix(in srgb, var(--ok) 50%, var(--warn))";
  if (c >= 40) return "var(--warn)";
  return "var(--danger)";
}
