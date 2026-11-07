"use client";

import { formatDateTime } from "@shop/core/time";
import { Button } from "@shop/ui/admin-button";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { AiJob } from "../api";
import { uahFromMinor } from "../model/format";
import { canCancel, canRetry } from "../model/job-state";
import { problemText, type TaskRowView } from "../model/task-center";
import { useAiJob, useCancelJob, useRetryJob } from "../queries";

/**
 * Подробности задачи в шторке (телефон) или панели (ПК). Сумма, токены и промпт приходят только админу с правом
 * «Финансы»: у остальных этих ключей в ответе нет, и блоков на экране нет тоже. Остановить можно свою задачу,
 * владелец — любую (это проверяет сервер).
 */
export function AiTaskDetail({ view, onDone }: { view: TaskRowView; onDone: () => void }) {
  const job = useAiJob(view.id).data;
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5" data-testid="ai-task-detail">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={view.tone}>{view.stateLabel}</Badge>
        <span className="text-[12.5px] text-[var(--text-muted)]">
          {view.admin} · {formatDateTime(view.when)}
        </span>
      </div>
      <h3 className="text-[16px] font-bold leading-snug text-[var(--ink)]">{view.title}</h3>
      {view.stale && <p className="text-[12.5px] text-[var(--warn)]">Результату больше двух недель, он мог устареть.</p>}
      {job && <JobFacts job={job} />}
      <Actions view={view} job={job} onDone={onDone} />
    </div>
  );
}

const PROBLEM = new Set(["EMPTY", "BAD_ANSWER", "FAILED"]);

/** Что случилось, сколько стоило, промпт: деньги и промпт — только если сервер их прислал. */
function JobFacts({ job }: { job: AiJob }) {
  return (
    <>
      {PROBLEM.has(job.status) && <p className="text-[13.5px] text-[var(--text)]">{problemText(job)}</p>}
      {job.costMinor != null && (
        <dl className="grid grid-cols-2 gap-2 text-[12.5px]" data-testid="ai-task-cost">
          <dt className="text-[var(--text-muted)]">Стоило</dt>
          <dd className="text-right tabular-nums text-[var(--text)]">{uahFromMinor(job.costMinor)}</dd>
          <dt className="text-[var(--text-muted)]">Токены (вход / выход)</dt>
          <dd className="text-right tabular-nums text-[var(--text)]">
            {job.inputTokens ?? 0} / {job.outputTokens ?? 0}
          </dd>
        </dl>
      )}
      {job.prompt && (
        <details className="rounded-[var(--r-sm)] border border-[var(--line)] p-3" data-testid="ai-task-prompt">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-[var(--accent)]">Промпт</summary>
          <pre className="thin-scroll mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11.5px] text-[var(--text)]">{job.prompt}</pre>
        </details>
      )}
    </>
  );
}

function Actions({ view, job, onDone }: { view: TaskRowView; job: AiJob | undefined; onDone: () => void }) {
  const cancel = useCancelJob();
  const retry = useRetryJob();
  return (
    <div className="flex flex-wrap gap-2">
      {view.reviewHref && (
        <Link href={view.reviewHref} onClick={onDone} className="contents">
          <Button variant="accent">Открыть проверку</Button>
        </Link>
      )}
      {job && canCancel(job) && (
        <Button variant="outline" loading={cancel.isPending} onClick={() => cancel.mutate(view.id)}>
          Остановить
        </Button>
      )}
      {job && canRetry(job) && (
        <Button variant="surface" loading={retry.isPending} onClick={() => retry.mutate(view.id)}>
          Попробовать внимательнее
        </Button>
      )}
    </div>
  );
}
