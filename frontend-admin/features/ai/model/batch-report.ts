/**
 * Итог пакета по предметам (как сводка прежнего мастера): что записано, что отклонено, что ждёт проверки и что не
 * получилось у ИИ и почему. Считается по последней задаче каждого предмета — повтор неудачной заменяет её. Чистая логика.
 */
import type { AiBatchRow } from "../api-batch";
import { problemText } from "./task-center";

export interface ReportLine {
  jobId: number;
  subjectId: string;
  /** Почему не получилось (только у `failed`). */
  why?: string;
}

export interface BatchReport {
  written: ReportLine[];
  rejected: ReportLine[];
  waiting: ReportLine[];
  failed: ReportLine[];
  /** Ещё в очереди или в работе. */
  running: number;
}

const line = (r: AiBatchRow): ReportLine => ({ jobId: r.id, subjectId: r.subjectId });

function latestPerSubject(rows: readonly AiBatchRow[]): AiBatchRow[] {
  const by = new Map<string, AiBatchRow>();
  for (const r of rows) {
    const prev = by.get(r.subjectId);
    if (!prev || prev.id < r.id) by.set(r.subjectId, r);
  }
  return [...by.values()].sort((a, b) => a.id - b.id);
}

export function batchReport(rows: readonly AiBatchRow[]): BatchReport {
  const out: BatchReport = { written: [], rejected: [], waiting: [], failed: [], running: 0 };
  for (const r of latestPerSubject(rows)) {
    if (r.outcome === "APPLIED" || r.outcome === "PARTIAL") out.written.push(line(r));
    else if (r.outcome === "REJECTED") out.rejected.push(line(r));
    else if (r.status === "DONE") out.waiting.push(line(r));
    else if (r.status === "QUEUED" || r.status === "RUNNING") out.running += 1;
    else out.failed.push({ ...line(r), why: r.status === "CANCELED" ? "Отменено" : problemText({ status: r.status, errorCode: r.errorCode ?? "" }) });
  }
  return out;
}
