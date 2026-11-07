"use client";

import { Button } from "@shop/ui/admin-button";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AiJobFailure,
  AiUnavailable,
  canCancel,
  canRetry,
  isActive,
  uahFromMinor,
  unavailableReason,
  useAiEstimate,
  useAiJob,
  useAiSummary,
  useCancelJob,
  useRetryJob,
  type AiJob,
} from "@/features/ai";
import { EXTRACT_PROMPT_VERSION, extractAdapter } from "../../model/ai/extract-prompt";
import { readDuration } from "../../model/ai/read-summary";
import { useStartSupplyJob } from "../../queries-ai";
import type { SupplyFiles } from "./use-supply-files";

/** Почему встроенное чтение сейчас недоступно (`null` — можно, `undefined` — ещё грузится). */
export function useReadReason() {
  const summary = useAiSummary();
  return unavailableReason(summary.data, "SUPPLY_EXTRACT", summary.isError);
}

function Running({ job }: { job: AiJob }) {
  const cancel = useCancelJob();
  return (
    <div className="flex flex-wrap items-center gap-3" role="status" aria-live="polite">
      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--accent)]" />
      <div className="min-w-0 text-[13px] font-semibold">ИИ читает файлы…</div>
      <Button variant="outline" size="sm" loading={cancel.isPending} disabled={!canCancel(job)} onClick={() => cancel.mutate(job.id)}>
        {job.cancelRequested ? "Останавливаю…" : "Остановить"}
      </Button>
    </div>
  );
}

function StartButton({ files, n, onStarted }: { files: SupplyFiles; n: number; onStarted: (job: AiJob) => void }) {
  const estimate = useAiEstimate({ feature: "SUPPLY_EXTRACT", mode: "NORMAL", items: n });
  const start = useStartSupplyJob();
  const e = estimate.data;
  const body = () => ({ fileIds: files.files.map((f) => f.id), prompt: extractAdapter.buildPrompt(), promptVersion: EXTRACT_PROMPT_VERSION });
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="accent"
        size="lg"
        icon={<Sparkles className="h-4 w-4" />}
        loading={start.isPending}
        disabled={files.uploading}
        onClick={() => start.mutate(body(), { onSuccess: onStarted })}
        className="w-full sm:w-auto"
      >
        Прочитать с ИИ
      </Button>
      <div className="text-[12px] text-[var(--text-muted)]">
        {e ? `≈ ${uahFromMinor(e.p50Minor)} · ${readDuration(e.seconds)}, не больше ${uahFromMinor(e.p90Minor)}` : "около 10 секунд"}
      </div>
    </div>
  );
}

function JobView({ job, onManual, onRetried }: { job: AiJob; onManual: () => void; onRetried: (job: AiJob) => void }) {
  const retry = useRetryJob();
  if (isActive(job.status)) return <Running job={job} />;
  return (
    <AiJobFailure
      job={job}
      onManual={onManual}
      onRetry={canRetry(job) ? () => retry.mutate(job.id, { onSuccess: onRetried }) : undefined}
      retrying={retry.isPending}
    />
  );
}

/**
 * «Прочитать с ИИ»: файлы → задача → ответ в то же поле, что и при ручном пути. Цена и время — под кнопкой (экран
 * показывается только финансистам). Закрытие окна не останавливает задачу: она остаётся в центре задач.
 */
export function ReadWithAi({ files, onAnswer, onManual }: { files: SupplyFiles; onAnswer: (text: string) => void; onManual: () => void }) {
  const reason = useReadReason();
  const [jobId, setJobId] = useState<number | null>(null);
  const job = useAiJob(jobId).data;
  const taken = useRef<number | null>(null);

  useEffect(() => {
    if (job && job.status === "DONE" && job.answer && taken.current !== job.id) {
      taken.current = job.id;
      onAnswer(job.answer);
    }
  }, [job, onAnswer]);

  const follow = (j: AiJob) => setJobId(j.id);
  if (reason === undefined || files.files.length === 0) return null;
  if (reason) return <AiUnavailable reason={reason} />;
  if (job && job.status !== "DONE") return <JobView job={job} onManual={onManual} onRetried={follow} />;
  if (job) return null;
  return <StartButton files={files} n={files.files.length} onStarted={follow} />;
}
