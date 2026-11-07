/** Строки проверки ответа ИИ: разобранный ответ → строки с замечаниями. Чистые функции. */
import { checkRuFix, checkTranslation, normalizeAnswerText, sameText, type Issue, type Level } from "./check";
import type { ParsedAnswer } from "./parse";
import type { TrLocale } from "./types";
import { LOCALES, type UniqueString, type WorkSet } from "./workset";

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
  /** The languages of this session (the «Язык» filter): only they are checked and saved. */
  langs: readonly TrLocale[];
  /** Nothing to do any more (every language of the session translated from the current source). */
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
  const issues = row.langs.flatMap((l) => checkTranslation(base, l, row[l]));
  return { ...row, issues, level: levelOf(issues) };
}

export function buildReview(
  parsed: ParsedAnswer,
  ws: WorkSet,
  langs: readonly TrLocale[] = LOCALES
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
    for (const l of langs) if (e[l] === undefined) missingLang.push({ level: "error", lang: l, text: `нет «${l}»` });
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
      langs,
      done: langs.every((l) => !str.needs[l]),
    };
    const checked = revalidate(row);
    const issues = [...missingLang, ...checked.issues.filter((i) => !missingLang.some((m) => m.lang === i.lang && m.level === "error"))];
    rows.push({ ...checked, issues, level: levelOf(issues) });
  });
  return { rows, unknown, invalid };
}
