"use client";

import { Button } from "@shop/ui/admin-button";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AiJobFailure,
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
import { buildMatchPrompt, MATCH_PROMPT_VERSION, matchSubject, type LeafCategory } from "../../model/ai/match-prompt";
import { readDuration } from "../../model/ai/read-summary";
import type { CatalogItem, ReviewRow } from "../../model/ai/types";
import { useStartMatchJob } from "../../queries-ai";
import type { SupplyAi } from "./use-supply-ai";

/** Предметы задач поставки на сервере — «файлы поставки» (как у чтения); набор строк отличает ключ «m…». */
const SUBJECT_TYPE = "SUPPLY_FILES";
/** Задача ищет в интернете только новые модели; бюджет поиска растёт с числом строк, но сервер берёт не больше 10. */
const MAX_RESEARCH = 10;

/** Почему встроенное сопоставление сейчас недоступно (`null` — можно, `undefined` — ещё грузится). */
export function useMatchReason() {
  const summary = useAiSummary();
  return unavailableReason(summary.data, "SUPPLY_MATCH", summary.isError);
}

/**
 * Сопоставление нерешённых строк встроенным ИИ: само запускается один раз на прочитанный документ (дальше — кнопкой),
 * ответ ложится только на строки, которые всё ещё не решены. Закрытие окна задачу не останавливает.
 */
export function useMatchJob(ai: SupplyAi, open: ReviewRow[], catalog: CatalogItem[], categories: LeafCategory[]) {
  const reason = useMatchReason();
  const [jobId, setJobId] = useState<number | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const job = useAiJob(jobId).data;
  const start = useStartMatchJob();
  const startedFor = useRef<object | null>(null);
  const taken = useRef<number | null>(null);

  const run = () => {
    if (open.length === 0) return;
    setApplied(null);
    start.mutate(
      {
        feature: "SUPPLY_MATCH",
        subjectType: SUBJECT_TYPE,
        subjectId: matchSubject(open),
        mode: "NORMAL",
        effort: "low",
        researchItems: Math.min(open.length, MAX_RESEARCH),
        prompt: buildMatchPrompt(open, catalog, categories),
        promptVersion: MATCH_PROMPT_VERSION,
      },
      { onSuccess: (j) => setJobId(j.id) },
    );
  };

  // Свежий `run` для эффекта ниже: сам эффект привязан к документу, а не к каждой перерисовке.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  // Сразу после чтения — но когда строки уже пересчитаны с памятью поставщика (иначе в промпт уйдут решённые ею строки).
  // По одному разу на документ, иначе каждое ручное решение запускало бы новую платную задачу.
  const hasOpen = open.length > 0;
  useEffect(() => {
    if (reason !== null || !ai.doc || !ai.settled || !hasOpen || startedFor.current === ai.doc) return;
    startedFor.current = ai.doc;
    runRef.current();
  }, [reason, ai.doc, ai.settled, hasOpen]);

  useEffect(() => {
    if (job && job.status === "DONE" && job.answer && taken.current !== job.id) {
      taken.current = job.id;
      ai.noteJob(job.id);
      setApplied(ai.applyHelp(job.answer, true));
    }
  }, [job, ai]);

  return { reason, job, applied, run, starting: start.isPending, follow: (j: AiJob) => setJobId(j.id) };
}

export type MatchJob = ReturnType<typeof useMatchJob>;

function Running({ job, n }: { job: AiJob; n: number }) {
  const cancel = useCancelJob();
  return (
    <div className="flex flex-wrap items-center gap-3" role="status" aria-live="polite">
      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--accent)]" />
      <div className="min-w-0 text-[13px] font-semibold">ИИ сопоставляет строки ({n}) и ищет новые модели…</div>
      <Button variant="outline" size="sm" loading={cancel.isPending} disabled={!canCancel(job)} onClick={() => cancel.mutate(job.id)}>
        {job.cancelRequested ? "Останавливаю…" : "Остановить"}
      </Button>
    </div>
  );
}

function StartButton({ m, n, again }: { m: MatchJob; n: number; again: boolean }) {
  const estimate = useAiEstimate({ feature: "SUPPLY_MATCH", mode: "NORMAL", items: n });
  const e = estimate.data;
  return (
    <div className="flex flex-col gap-1.5">
      <Button variant={again ? "surface" : "accent"} icon={<Sparkles className="h-4 w-4" />} loading={m.starting} onClick={m.run} className="w-full sm:w-auto">
        {again ? `Сопоставить оставшиеся с ИИ (${n})` : `Сопоставить с ИИ (${n})`}
      </Button>
      <div className="text-[12px] text-[var(--text-muted)]">
        {/* Цену сервер отдаёт только финансисту; остальным — только время. */}
        {e?.p50Minor != null && e.p90Minor != null
          ? `≈ ${uahFromMinor(e.p50Minor)} · ${readDuration(e.seconds)}, не больше ${uahFromMinor(e.p90Minor)}`
          : e
            ? readDuration(e.seconds)
            : null}
      </div>
    </div>
  );
}

/** Встроенный путь шага 2: идёт / не удалось / итог / кнопка. */
export function MatchWithAi({ m, open, onManual }: { m: MatchJob; open: number; onManual: () => void }) {
  const retry = useRetryJob();
  // Недоступность (выключено, лимит) уже показывает шаг чтения — та же настройка «Поставки».
  if (m.reason !== null) return null;
  const job = m.job;
  if (job && isActive(job.status)) return <Running job={job} n={open} />;
  if (job && job.status !== "DONE") {
    return (
      <AiJobFailure
        job={job}
        onManual={onManual}
        onRetry={canRetry(job) ? () => retry.mutate(job.id, { onSuccess: m.follow }) : undefined}
        retrying={retry.isPending}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {m.applied != null && (
        <div className="text-[13px] font-semibold text-[var(--ok)]" role="status">
          ✓ ИИ решил строк: {m.applied} — проверьте их ниже{open > 0 ? `; не решено: ${open}` : ""}
        </div>
      )}
      {open > 0 && !m.starting && <StartButton m={m} n={open} again={job != null} />}
      {open > 0 && m.starting && !job && (
        <div className="flex items-center gap-2 text-[13px] font-semibold" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" /> Запускаю сопоставление…
        </div>
      )}
    </div>
  );
}
