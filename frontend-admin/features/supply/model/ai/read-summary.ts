import { aboutDuration } from "@/features/ai";
/** Плашка «Прочитано N из M»: сколько строк ответа ИИ стали строками проверки. Чистая логика. */
import type { ParsedExtract } from "./parse";

export interface ReadSummary {
  read: number;
  /** Строк в ответе: прочитанные + отброшенные разбором (без названия, дробное количество…). */
  total: number;
  /** null — итога в документе нет, сверять не с чем. */
  sumMatches: boolean | null;
}

const DROPPED = /^Строка \d+/;

export function readSummary(parsed: ParsedExtract | null, sumIssue: string | null): ReadSummary | null {
  const doc = parsed?.doc;
  if (!parsed || !doc) return null;
  const dropped = parsed.errors.filter((e) => DROPPED.test(e)).length;
  return { read: doc.lines.length, total: doc.lines.length + dropped, sumMatches: doc.total == null ? null : sumIssue == null };
}

export function readSummaryText(s: ReadSummary): string {
  const sum = s.sumMatches == null ? "" : s.sumMatches ? ", сумма сошлась" : ", сумма не сошлась";
  return `Прочитано ${s.read} из ${s.total}${sum}`;
}


/** «около 10 секунд» для оценки чтения (картинок читают секунды, а не минуты); дольше — обычное «около N минут». */
export function readDuration(seconds: number): string {
  if (seconds >= 45) return aboutDuration(seconds);
  const step = Math.max(5, Math.round(seconds / 5) * 5);
  return `около ${step} секунд`;
}
