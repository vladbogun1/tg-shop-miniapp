/** Проверки перевода и правки оригинала против русского источника. Чистые функции. */
import { countMap, wordSimilarity } from "./diff";
import { toPercent } from "@shop/core/percent";
import { ratioText } from "./ratio-text";
import type { TrLocale } from "./types";

/** `{name}`-style slots of chat templates (ReplyTemplateService fills them in). */
const PLACEHOLDER = /\{[a-zA-Z0-9]+\}/g;

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

type Report = (level: Issue["level"], text: string) => void;

function checkNumbers(source: string, text: string, report: Report): void {
  const srcDigits = countMap(source.match(DIGITS) ?? []);
  const dstDigits = countMap(text.match(DIGITS) ?? []);
  const lost: string[] = [];
  srcDigits.forEach((n, d) => {
    if ((dstDigits.get(d) ?? 0) < n) lost.push(d);
  });
  if (lost.length) report("error", `потеряно число: ${lost.slice(0, 5).join(", ")}`);
  const extra: string[] = [];
  dstDigits.forEach((n, d) => {
    if ((srcDigits.get(d) ?? 0) < n) extra.push(d);
  });
  if (extra.length) report("warn", `новое число: ${extra.slice(0, 5).join(", ")}`);
}

/**
 * Chat templates: {name}, {orderNo}… are filled in from the order — a translated or dropped one
 * would reach the customer as is.
 */
function checkPlaceholders(source: string, text: string, report: Report): void {
  const srcSlots = countMap(source.match(PLACEHOLDER) ?? []);
  const dstSlots = countMap(text.match(PLACEHOLDER) ?? []);
  const badSlots: string[] = [];
  srcSlots.forEach((n, k) => {
    if ((dstSlots.get(k) ?? 0) !== n) badSlots.push(k);
  });
  dstSlots.forEach((_, k) => {
    if (!srcSlots.has(k)) badSlots.push(k);
  });
  if (badSlots.length) report("error", `плейсхолдеры не совпадают: ${badSlots.slice(0, 5).join(", ")}`);
}

function checkLatin(source: string, lang: TrLocale, text: string, report: Report): void {
  const latin = Array.from(new Set(source.match(LATIN_TOKEN) ?? []));
  const lower = text.toLowerCase();
  const missingLatin = latin.filter((t) => !lower.includes(t.toLowerCase()));
  if (missingLatin.length) {
    report(lang === "uk" ? "error" : "warn", `нет латиницы из оригинала: ${missingLatin.slice(0, 5).join(", ")}`);
  }
}

function checkLength(source: string, lang: TrLocale, text: string, report: Report): void {
  if (source.length < 15) {
    if (text.length > source.length * 4 + 20) report("warn", "перевод намного длиннее оригинала");
    return;
  }
  const r = text.length / source.length;
  const [errLo, warnLo, warnHi, errHi] = lang === "uk" ? [0.4, 0.7, 1.5, 2.5] : [0.35, 0.6, 1.6, 2.5];
  if (r < errLo || r > errHi) report("error", `длина ×${ratioText(r)} от оригинала`);
  else if (r < warnLo || r > warnHi) report("warn", `длина ×${ratioText(r)} от оригинала`);
}

function checkScript(lang: TrLocale, text: string, report: Report): void {
  if (lang === "uk" && RU_ONLY.test(text)) {
    const bad = Array.from(new Set((text.match(CYR_WORD) ?? []).filter((w) => RU_ONLY.test(w))));
    report("error", `русские буквы (ы/э/ъ/ё): ${bad.slice(0, 4).join(", ")}`);
  }
  if (lang === "en") {
    const cyr = Array.from(new Set(text.match(CYR_WORD) ?? []));
    if (cyr.length) report("warn", `кириллица в английском: ${cyr.slice(0, 4).join(", ")}`);
  }
}

/** Checks of one translation against its Russian source. */
export function checkTranslation(source: string, lang: TrLocale, text: string): Issue[] {
  const issues: Issue[] = [];
  const report: Report = (level, t) => issues.push({ level, lang, text: t });

  if (!text.trim()) {
    report("error", "пусто");
    return issues;
  }
  const ls = lineCount(source);
  const lt = lineCount(text);
  if (ls !== lt) report("error", `строк ${lt}, а в оригинале ${ls}`);
  checkNumbers(source, text, report);
  checkPlaceholders(source, text, report);
  checkLatin(source, lang, text, report);
  checkLength(source, lang, text, report);
  checkScript(lang, text, report);

  const es = (source.match(EMOJI) ?? []).length;
  const et = (text.match(EMOJI) ?? []).length;
  if (es !== et) report("warn", `эмодзи: ${et} вместо ${es}`);
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
  if (similarity < 0.75) err(`текст сильно переписан (совпадение ${Math.round(toPercent(similarity))} %)`);
  return { issues, similarity };
}


/** Ошибки (не замечания) автопроверки по языкам — «L: текст», для подтверждения «Сохранить с замечаниями?». */
export function blockingIssues(source: string, langs: TrLocale[], texts: Partial<Record<TrLocale, string>>): string[] {
  return langs.flatMap((l) =>
    checkTranslation(source, l, texts[l]!)
      .filter((i) => i.level === "error")
      .map((i) => `${l.toUpperCase()}: ${i.text}`)
  );
}
