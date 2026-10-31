/** Разбор ответа ИИ (блоки ```json с { id: { ru, uk, en } }) — формат описан в `prompt.ts`. */

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

/** Одна запись ответа: языки ru/uk/en как строки, остальное — замечания по форме. */
function readEntry(v: unknown): AnswerEntry {
  const entry: AnswerEntry = { problems: [] };
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    entry.problems.push("значение не объект { ru, uk, en }");
    return entry;
  }
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const lang = k.trim().toLowerCase();
    if (lang !== "ru" && lang !== "uk" && lang !== "en") continue;
    if (typeof val === "string") entry[lang] = val.replace(/\r\n?/g, "\n");
    else entry.problems.push(`«${lang}» не строка`);
  }
  return entry;
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
      entries.set(id, readEntry(v));
    }
  });
  return { entries, errors, notes: Array.from(notes), duplicates };
}

