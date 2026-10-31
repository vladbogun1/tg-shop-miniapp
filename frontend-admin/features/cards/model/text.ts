/**
 * «Карточки»: проверка текстов товара (название, описание, причина уценки) и их переводов uk/en: что потеряло
 * описание (оговорки, числа), правила длины, свежесть перевода. Чистая логика.
 */
import { checkTranslation } from "@/features/translation";
import type { CardItem } from "./item";
import { levelOf } from "./level";
import type { CardIssue, DescriptionReview, TextLang, TextReview } from "./types";

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

export function langTexts(v: unknown): Partial<Record<TextLang, string>> | null {
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
