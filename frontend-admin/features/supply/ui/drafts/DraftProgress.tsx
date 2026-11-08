"use client";

/**
 * Ход работы ИИ в черновике: четыре шага (читает → сопоставляет → карточки → готово) и задачи под ними с тем, что
 * задача делает сейчас или почему не вышла. Цена задач — только финансисту (её сервер другим не отдаёт).
 */
import { AlertTriangle, Check, CircleDashed, Loader2, X } from "lucide-react";
import { uahFromMinor } from "@/features/ai";
import { cn } from "@/lib/cn";
import type { DraftJob, SupplyDraft } from "../../api-drafts";
import { STEPS, stepStates, type StepState } from "../../model/drafts/draft";

const ICON: Record<StepState, typeof Check> = { done: Check, active: Loader2, failed: X, waiting: CircleDashed };
const TINT: Record<StepState, string> = {
  done: "border-[var(--ok)] bg-[rgba(34,197,94,.12)] text-[var(--ok)]",
  active: "border-[var(--accent)] text-[var(--accent)]",
  failed: "border-[var(--danger)] text-[var(--danger)]",
  waiting: "border-[var(--line-strong)] text-[var(--text-faint)]",
};
const JOB_STATUS: Record<string, string> = {
  QUEUED: "в очереди",
  RUNNING: "работает",
  DONE: "готово",
  FAILED: "не вышло",
  CANCELED: "остановлено",
  EMPTY: "пустой ответ",
  BAD_ANSWER: "ответ не прочитан",
};

function Steps({ draft }: { draft: SupplyDraft }) {
  const states = stepStates(draft.step, draft.status);
  return (
    <ol className="grid min-w-0 gap-2 sm:grid-cols-4" aria-label="Шаги ИИ">
      {STEPS.map((s, i) => {
        const st = states[i];
        const Icon = ICON[st];
        return (
          <li key={s.step} className="flex min-w-0 items-center gap-2.5 sm:flex-col sm:items-start sm:gap-1.5" aria-current={st === "active" ? "step" : undefined}>
            <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border-2", TINT[st])}>
              <Icon className={cn("h-3.5 w-3.5", st === "active" && "animate-spin")} />
            </span>
            <span className={cn("min-w-0 text-[13px] font-semibold", st === "waiting" ? "text-[var(--text-faint)]" : "text-[var(--text)]")}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function JobLine({ job, finance }: { job: DraftJob; finance: boolean }) {
  const running = job.status === "RUNNING" || job.status === "QUEUED";
  const failed = job.status === "FAILED" || job.status === "EMPTY" || job.status === "BAD_ANSWER";
  return (
    <li className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-[var(--line)] py-2 last:border-b-0">
      <span className="min-w-0 flex-1 basis-56 break-words text-[13px] text-[var(--text)]">{job.label}</span>
      <span className={cn("text-[12.5px]", failed ? "text-[var(--danger-ink)]" : running ? "text-[var(--accent-hi)]" : "text-[var(--text-muted)]")}>
        {running && job.step ? job.step : (JOB_STATUS[job.status] ?? job.status.toLowerCase())}
      </span>
      {finance && job.costMinor != null && job.costMinor > 0 && <span className="tabular text-[12px] text-[var(--text-faint)]">{uahFromMinor(job.costMinor)}</span>}
      {failed && job.error && <span className="w-full break-words text-[12.5px] text-[var(--danger-ink)]">{job.error}</span>}
    </li>
  );
}

/** Предупреждения ИИ и заметки документа — то, на что стоит взглянуть до «Принять». */
export function DraftNotes({ draft }: { draft: SupplyDraft }) {
  const notes = [...draft.warnings, ...draft.docNotes];
  if (notes.length === 0) return null;
  return (
    <div className="mb-5 rounded-[var(--r-md)] border border-[rgba(245,158,11,.35)] bg-[rgba(245,158,11,.07)] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--warn)]">
        <AlertTriangle className="h-4 w-4" /> Обратите внимание
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-[var(--text)]">
        {notes.map((n, i) => (
          <li key={i} className="break-words">
            {n}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DraftProgress({ draft, finance }: { draft: SupplyDraft; finance: boolean }) {
  return (
    <div className="card mb-5 flex min-w-0 flex-col gap-4 p-4" role="status" aria-live="polite">
      <Steps draft={draft} />
      {draft.status === "RUNNING" && (
        <p className="text-[13px] text-[var(--text-muted)]">
          Можно закрыть страницу — ИИ продолжит работу, а когда закончит, придёт уведомление «Поставка готова — проверьте».
        </p>
      )}
      {draft.failure && <p className="break-words text-[13.5px] font-semibold text-[var(--danger-ink)]">{draft.failure}</p>}
      {draft.jobs.length > 0 && (
        <ul className="min-w-0">
          {draft.jobs.map((j) => (
            <JobLine key={j.jobId} job={j} finance={finance} />
          ))}
        </ul>
      )}
      {finance && draft.costMinor != null && draft.costMinor > 0 && (
        <div className="text-[12.5px] text-[var(--text-muted)]">
          Потрачено на ИИ: <span className="tabular font-semibold text-[var(--text)]">{uahFromMinor(draft.costMinor)}</span>
        </div>
      )}
    </div>
  );
}
