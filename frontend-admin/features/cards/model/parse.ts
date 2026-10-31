/**
 * «Карточки»: разбор ответа ИИ — достаём JSON-блоки, чиним типичные огрехи (висячие запятые, «умные» кавычки,
 * оборванный ответ) и собираем записи по id товаров. Формат ответа описан в `prompt.ts`. Чистая логика.
 */

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
