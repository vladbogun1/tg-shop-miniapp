/** Строки проверки ответа ИИ: разобранный ответ → строки с замечаниями. Чистые функции. */
import { checkRuFix, checkTranslation, normalizeAnswerText, sameText, type Issue, type Level } from "./check";
import type { ParsedAnswer } from "./parse";
import type { UniqueString, WorkSet } from "./workset";

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
