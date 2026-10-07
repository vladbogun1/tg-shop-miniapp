/**
 * «Переводы»: work set (unique Russian strings), parsing of the AI answer and its validation.
 * Pure functions, no React — the format they read is described in `translation-prompt.ts`.
 */
import type { TrExportItem, TrLocale, TrOrigin, TrStatus } from "@/lib/api";

export const LOCALES: TrLocale[] = ["uk", "en"];

// ============================================================================
// Work set
// ============================================================================

/** One translatable field (both languages joined). */
export interface FieldRef {
  key: string;
  entityType: string;
  entityId: string;
  field: string;
  source: string;
  sourceHash: string;
  productId: string | null;
  productTitle: string | null;
  status: Record<TrLocale, TrStatus>;
  text: Record<TrLocale, string | null>;
  origin: Record<TrLocale, TrOrigin | null>;
}

/** One unique Russian string = one id in the prompt, fanned out to all its fields. */
export interface UniqueString {
  id: string;
  sourceHash: string;
  source: string;
  /** `${entityType}.${field}` of the first field — what the AI is told the string is. */
  kindKey: string;
  /** Context: the product of a variant name, the category of a category SEO field. */
  product: string | null;
  fields: FieldRef[];
  /** Some field still needs this language (MISSING or STALE). */
  needs: Record<TrLocale, boolean>;
  hasMissing: boolean;
  hasStale: boolean;
}

export interface WorkSet {
  fields: FieldRef[];
  strings: UniqueString[];
  byId: Map<string, UniqueString>;
}

const TYPE_ORDER: Record<string, number> = { TAG: 0, PAYMENT_OPTION: 1, PRODUCT: 2, VARIANT: 3 };
const FIELD_ORDER: Record<string, number> = {
  title: 0,
  name: 0,
  description: 1,
  seo_title: 2,
  seo_description: 3,
  h1: 4,
  intro_text: 5,
  purpose: 0,
  note: 1,
};

export function fieldKey(i: { entityType: string; entityId: string; field: string }): string {
  return `${i.entityType}:${i.entityId}:${i.field}`;
}

function lcp(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * id = "t" + shortest hex prefix of the source hash (min 6) that is unique among ALL current
 * sources — stable across reloads, filters and parts.
 */
export function assignIds(hashes: string[]): Map<string, string> {
  const sorted = Array.from(new Set(hashes)).sort();
  const out = new Map<string, string>();
  sorted.forEach((h, i) => {
    let len = 6;
    if (i > 0) len = Math.max(len, lcp(sorted[i - 1], h) + 1);
    if (i < sorted.length - 1) len = Math.max(len, lcp(sorted[i + 1], h) + 1);
    out.set(h, "t" + h.slice(0, len));
  });
  return out;
}

export function buildWorkSet(uk: TrExportItem[], en: TrExportItem[]): WorkSet {
  const map = new Map<string, FieldRef>();
  const add = (locale: TrLocale, it: TrExportItem) => {
    const key = fieldKey(it);
    let f = map.get(key);
    if (!f) {
      f = {
        key,
        entityType: it.entityType,
        entityId: it.entityId,
        field: it.field,
        source: it.source,
        sourceHash: it.sourceHash,
        productId: it.productId ?? null,
        productTitle: it.productTitle ?? null,
        status: { uk: "MISSING", en: "MISSING" },
        text: { uk: null, en: null },
        origin: { uk: null, en: null },
      };
      map.set(key, f);
    }
    f.status[locale] = it.status;
    f.text[locale] = it.text;
    f.origin[locale] = it.origin;
  };
  uk.forEach((i) => add("uk", i));
  en.forEach((i) => add("en", i));

  const fields = Array.from(map.values()).sort(
    (a, b) =>
      (TYPE_ORDER[a.entityType] ?? 9) - (TYPE_ORDER[b.entityType] ?? 9) ||
      (a.productTitle ?? "").localeCompare(b.productTitle ?? "", "ru") ||
      a.entityId.localeCompare(b.entityId) ||
      (FIELD_ORDER[a.field] ?? 9) - (FIELD_ORDER[b.field] ?? 9)
  );
  const ids = assignIds(fields.map((f) => f.sourceHash));
  const byHash = new Map<string, UniqueString>();
  const strings: UniqueString[] = [];
  for (const f of fields) {
    let s = byHash.get(f.sourceHash);
    if (!s) {
      s = {
        id: ids.get(f.sourceHash)!,
        sourceHash: f.sourceHash,
        source: f.source,
        kindKey: `${f.entityType}.${f.field}`,
        // Context for the AI: the product of a variant name, the category of a category SEO text.
        product: f.entityType === "VARIANT" || (f.entityType === "TAG" && f.field !== "name") ? f.productTitle : null,
        fields: [],
        needs: { uk: false, en: false },
        hasMissing: false,
        hasStale: false,
      };
      byHash.set(f.sourceHash, s);
      strings.push(s);
    }
    s.fields.push(f);
    for (const l of LOCALES) {
      if (f.status[l] !== "TRANSLATED") s.needs[l] = true;
      if (f.status[l] === "MISSING") s.hasMissing = true;
      if (f.status[l] === "STALE") s.hasStale = true;
    }
  }
  return { fields, strings, byId: new Map(strings.map((s) => [s.id, s])) };
}

// ============================================================================
// Parsing the answer
// ============================================================================

export interface AnswerEntry {
  ru?: string;
  uk?: string;
  en?: string;
  /** Shape problems of this entry (not an object, non-string values…). */
  problems: string[];
}

export interface ParsedAnswer {
  entries: Map<string, AnswerEntry>;
  /** Fatal problems of the whole answer (nothing could be read). */
  errors: string[];
  /** Repairs applied (trailing commas, smart quotes) — shown as a notice. */
  notes: string[];
  /** Ids present more than once with different texts — excluded. */
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
  // An unclosed fence (answer cut off / copied partially): take what follows it.
  const open = text.indexOf("```");
  const body = open >= 0 ? text.slice(text.indexOf("\n", open) + 1) : text;
  const a = body.indexOf("{");
  const b = body.lastIndexOf("}");
  if (a >= 0 && b > a) blocks.push(body.slice(a, b + 1));
  return blocks;
}

function tryParse(block: string, notes: Set<string>): { value?: unknown; error?: string } {
  const attempts: { text: string; note?: string }[] = [
    { text: block },
    { text: block.replace(/,(\s*[}\]])/g, "$1"), note: "убраны висячие запятые" },
    {
      text: block.replace(/[“”„‟″]/g, '"').replace(/,(\s*[}\]])/g, "$1"),
      note: "«умные» кавычки заменены на обычные — проверьте тексты с кавычками",
    },
  ];
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

const ID_KEY = /"(t[0-9a-f]{6,64})"\s*:/g;

export function parseAnswer(raw: string): ParsedAnswer {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const entries = new Map<string, AnswerEntry>();
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

  const seenRaw = new Map<string, string>();
  blocks.forEach((block, bi) => {
    const label = blocks.length > 1 ? `Блок ${bi + 1}: ` : "";
    // Same key twice inside one object: JSON.parse silently keeps the last one — ambiguous.
    const counts = new Map<string, number>();
    for (const m of block.matchAll(ID_KEY)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    counts.forEach((n, id) => n > 1 && duplicates.add(id));

    const { value, error } = tryParse(block, notes);
    if (error !== undefined) {
      errors.push(`${label}JSON не читается (${error}). Попросите ИИ повторить ответ строго одним блоком \`\`\`json.`);
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${label}ожидался JSON-объект { "id": { "ru", "uk", "en" } }.`);
      return;
    }
    for (const [rawKey, v] of Object.entries(value as Record<string, unknown>)) {
      const id = rawKey.trim().toLowerCase();
      const serialized = JSON.stringify(v);
      const prev = seenRaw.get(id);
      if (prev !== undefined) {
        if (prev !== serialized) duplicates.add(id);
        continue;
      }
      seenRaw.set(id, serialized);
      const entry: AnswerEntry = { problems: [] };
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        entry.problems.push("значение не объект { ru, uk, en }");
      } else {
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          const lang = k.trim().toLowerCase();
          if (lang !== "ru" && lang !== "uk" && lang !== "en") continue;
          if (typeof val === "string") entry[lang] = val.replace(/\r\n?/g, "\n");
          else entry.problems.push(`«${lang}» не строка`);
        }
      }
      entries.set(id, entry);
    }
  });
  return { entries, errors, notes: Array.from(notes), duplicates };
}

// ============================================================================
// Validation
// ============================================================================

export type Level = "ok" | "warn" | "error";

export interface Issue {
  level: Exclude<Level, "ok">;
  lang: "uk" | "en" | "ru" | "*";
  text: string;
}

const RU_ONLY = /[ЫыЭэЪъЁё]/;
const CYR_WORD = /[А-Яа-яЁёІіЇїЄєҐґ][А-Яа-яЁёІіЇїЄєҐґ'’-]*/g;
const LATIN_TOKEN = /[A-Za-z]{3,}/g;
const DIGITS = /\d+/g;
const EMOJI = /\p{Extended_Pictographic}/gu;

function countMap(list: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of list) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

export function lineCount(s: string): number {
  return s.replace(/\s+$/, "").split("\n").length;
}

/** Keeps the AI text but drops outer whitespace the source does not have. */
export function normalizeAnswerText(source: string, text: string): string {
  let t = text.replace(/\r\n?/g, "\n");
  if (!/^\s/.test(source)) t = t.replace(/^\s+/, "");
  if (!/\s$/.test(source)) t = t.replace(/\s+$/, "");
  return t;
}

/** Checks of one translation against its Russian source. */
export function checkTranslation(source: string, lang: TrLocale, text: string): Issue[] {
  const issues: Issue[] = [];
  const err = (t: string) => issues.push({ level: "error", lang, text: t });
  const warn = (t: string) => issues.push({ level: "warn", lang, text: t });

  if (!text.trim()) {
    err("пусто");
    return issues;
  }
  const ls = lineCount(source);
  const lt = lineCount(text);
  if (ls !== lt) err(`строк ${lt}, а в оригинале ${ls}`);

  const srcDigits = countMap(source.match(DIGITS) ?? []);
  const dstDigits = countMap(text.match(DIGITS) ?? []);
  const lost: string[] = [];
  srcDigits.forEach((n, d) => {
    if ((dstDigits.get(d) ?? 0) < n) lost.push(d);
  });
  if (lost.length) err(`потеряно число: ${lost.slice(0, 5).join(", ")}`);
  const extra: string[] = [];
  dstDigits.forEach((n, d) => {
    if ((srcDigits.get(d) ?? 0) < n) extra.push(d);
  });
  if (extra.length) warn(`новое число: ${extra.slice(0, 5).join(", ")}`);

  const latin = Array.from(new Set(source.match(LATIN_TOKEN) ?? []));
  const lower = text.toLowerCase();
  const missingLatin = latin.filter((t) => !lower.includes(t.toLowerCase()));
  if (missingLatin.length) {
    const msg = `нет латиницы из оригинала: ${missingLatin.slice(0, 5).join(", ")}`;
    if (lang === "uk") err(msg);
    else warn(msg);
  }

  if (source.length >= 15) {
    const r = text.length / source.length;
    const [errLo, warnLo, warnHi, errHi] = lang === "uk" ? [0.4, 0.7, 1.5, 2.5] : [0.35, 0.6, 1.6, 2.5];
    if (r < errLo || r > errHi) err(`длина ×${r.toFixed(2)} от оригинала`);
    else if (r < warnLo || r > warnHi) warn(`длина ×${r.toFixed(2)} от оригинала`);
  } else if (text.length > source.length * 4 + 20) {
    warn("перевод намного длиннее оригинала");
  }

  if (lang === "uk" && RU_ONLY.test(text)) {
    const bad = Array.from(new Set((text.match(CYR_WORD) ?? []).filter((w) => RU_ONLY.test(w))));
    err(`русские буквы (ы/э/ъ/ё): ${bad.slice(0, 4).join(", ")}`);
  }
  if (lang === "en") {
    const cyr = Array.from(new Set(text.match(CYR_WORD) ?? []));
    if (cyr.length) warn(`кириллица в английском: ${cyr.slice(0, 4).join(", ")}`);
  }

  const es = (source.match(EMOJI) ?? []).length;
  const et = (text.match(EMOJI) ?? []).length;
  if (es !== et) warn(`эмодзи: ${et} вместо ${es}`);
  return issues;
}

/** Whitespace-insensitive equality — a reformatted but identical "ru" is not a fix. */
export function sameText(a: string, b: string): boolean {
  const n = (s: string) => s.replace(/[ \t]+$/gm, "").trim();
  return n(a) === n(b);
}

/**
 * The proposed proofreading of the source. Returns the issues that make the fix unsafe to apply
 * (it is then only shown) and the word similarity.
 */
export function checkRuFix(source: string, ru: string): { issues: Issue[]; similarity: number } {
  const issues: Issue[] = [];
  const err = (t: string) => issues.push({ level: "error", lang: "ru", text: t });
  if (!ru.trim()) {
    err("правка пустая");
    return { issues, similarity: 0 };
  }
  if (lineCount(source) !== lineCount(ru)) err("в правке другое число строк");
  const a = (source.match(DIGITS) ?? []).join(" ");
  const b = (ru.match(DIGITS) ?? []).join(" ");
  if (a !== b) err("в правке изменены числа");
  const la = (source.match(LATIN_TOKEN) ?? []).join(" ").toLowerCase();
  const lb = (ru.match(LATIN_TOKEN) ?? []).join(" ").toLowerCase();
  if (la !== lb) err("в правке изменена латиница (бренды/модели)");
  const similarity = wordSimilarity(source, ru);
  if (similarity < 0.75) err(`текст сильно переписан (совпадение ${Math.round(similarity * 100)} %)`);
  return { issues, similarity };
}

// ============================================================================
// Word diff (for the proofreading suggestion)
// ============================================================================

export interface DiffPart {
  type: "same" | "del" | "add";
  text: string;
}

function tokens(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t.length > 0);
}

const MAX_DIFF_TOKENS = 2000;

function lcsTable(a: string[], b: string[]): Uint16Array[] {
  const t: Uint16Array[] = [];
  for (let i = 0; i <= a.length; i++) t.push(new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  return t;
}

/** Word-level diff; null when the texts are too long to diff in the browser. */
export function wordDiff(from: string, to: string): DiffPart[] | null {
  const a = tokens(from);
  const b = tokens(to);
  if (a.length > MAX_DIFF_TOKENS || b.length > MAX_DIFF_TOKENS) return null;
  const t = lcsTable(a, b);
  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) {
      push("del", a[i++]);
    } else {
      push("add", b[j++]);
    }
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return out;
}

function wordSimilarity(a: string, b: string): number {
  const wa = a.split(/\s+/).filter(Boolean);
  const wb = b.split(/\s+/).filter(Boolean);
  if (!wa.length && !wb.length) return 1;
  if (wa.length > MAX_DIFF_TOKENS || wb.length > MAX_DIFF_TOKENS) {
    // Too long for LCS: compare multisets of words.
    const ca = countMap(wa);
    let common = 0;
    for (const w of wb) {
      const n = ca.get(w) ?? 0;
      if (n > 0) {
        common++;
        ca.set(w, n - 1);
      }
    }
    return (2 * common) / (wa.length + wb.length);
  }
  const t = lcsTable(wa, wb);
  return (2 * t[0][0]) / (wa.length + wb.length);
}

// ============================================================================
// Review rows
// ============================================================================

export interface ReviewRow {
  id: string;
  str: UniqueString;
  uk: string;
  en: string;
  /** AI's proofread source (normalized); equals the source when unchanged. */
  ru: string;
  ruChanged: boolean;
  ruIssues: Issue[];
  issues: Issue[];
  level: Level;
  /** Nothing to do any more (both languages translated from the current source). */
  done: boolean;
}

export function levelOf(issues: Issue[]): Level {
  if (issues.some((i) => i.level === "error")) return "error";
  if (issues.some((i) => i.level === "warn")) return "warn";
  return "ok";
}

/** Re-runs the checks after an inline edit. */
export function revalidate(row: ReviewRow): ReviewRow {
  const base = row.ruChanged && row.ruIssues.length === 0 ? row.ru : row.str.source;
  const issues = [...checkTranslation(base, "uk", row.uk), ...checkTranslation(base, "en", row.en)];
  return { ...row, issues, level: levelOf(issues) };
}

export function buildReview(
  parsed: ParsedAnswer,
  ws: WorkSet
): { rows: ReviewRow[]; unknown: string[]; invalid: { id: string; problems: string[] }[] } {
  const rows: ReviewRow[] = [];
  const unknown: string[] = [];
  const invalid: { id: string; problems: string[] }[] = [];
  parsed.entries.forEach((e, id) => {
    const str = ws.byId.get(id);
    if (!str) {
      unknown.push(id);
      return;
    }
    const problems = [...e.problems];
    if (parsed.duplicates.has(id)) problems.push("id встречается в ответе несколько раз");
    if (problems.length) {
      invalid.push({ id, problems });
      return;
    }
    const uk = normalizeAnswerText(str.source, e.uk ?? "");
    const en = normalizeAnswerText(str.source, e.en ?? "");
    const ruRaw = e.ru === undefined ? str.source : normalizeAnswerText(str.source, e.ru);
    const ruChanged = !sameText(ruRaw, str.source);
    const ruIssues = ruChanged ? checkRuFix(str.source, ruRaw).issues : [];
    const missingLang: Issue[] = [];
    if (e.uk === undefined) missingLang.push({ level: "error", lang: "uk", text: "нет «uk»" });
    if (e.en === undefined) missingLang.push({ level: "error", lang: "en", text: "нет «en»" });
    if (e.ru === undefined) missingLang.push({ level: "warn", lang: "ru", text: "нет «ru» (вычитка пропущена)" });
    const row: ReviewRow = {
      id,
      str,
      uk,
      en,
      ru: ruChanged ? ruRaw : str.source,
      ruChanged,
      ruIssues,
      issues: [],
      level: "ok",
      done: !str.needs.uk && !str.needs.en,
    };
    const checked = revalidate(row);
    const issues = [...missingLang, ...checked.issues.filter((i) => !missingLang.some((m) => m.lang === i.lang && m.level === "error"))];
    rows.push({ ...checked, issues, level: levelOf(issues) });
  });
  return { rows, unknown, invalid };
}
