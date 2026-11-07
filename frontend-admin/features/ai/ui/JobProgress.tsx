"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { nowMs } from "@shop/core/time";
import { cn } from "@/lib/cn";
import type { AiJob } from "../api";
import { elapsedClock, isSlow } from "../model/job-state";
import { STAGES, stageOf, stagePercent, type StageIndex } from "../model/job-steps";

/**
 * Ход работы: этапы из макета (Читаю карточку → Ищу в интернете → Собираю ответ) по шагу с сервера, сам шаг строкой
 * («Ищу: viper v3 specs»), полоса, таймер и подсказка про «можно закрыть». Слов «DONE/ходы» здесь нет.
 */
export function JobProgress({ job, onCancel, cancelling }: { job: AiJob; onCancel: () => void; cancelling: boolean }) {
  const [tick, setTick] = useState(() => nowMs());
  useEffect(() => {
    const t = setInterval(() => setTick(nowMs()), 1000);
    return () => clearInterval(t);
  }, []);
  const queued = job.status === "QUEUED";
  const slow = isSlow(job.createdAt, tick);
  const stage = stageOf(job.step);
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--accent)]" />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-[var(--ink)]">{queued ? "Ждёт своей очереди" : "ИИ ищет данные и заполняет карточку"}</div>
          <div className="text-[12px] tabular-nums text-[var(--text-muted)]">Идёт {elapsedClock(job.createdAt, tick)}</div>
        </div>
      </div>
      {!queued && <Stages stage={stage} step={job.step ?? null} />}
      {slow && <p className="text-[12px] text-[var(--warn)]">Это дольше обычного. Можно подождать или остановить и заполнить вручную.</p>}
      <p className="text-[12px] leading-snug text-[var(--text-muted)]">
        Окно можно закрыть: задача продолжится, а готовый результат ждёт под значком ✦ вверху.
      </p>
      <div>
        <Button variant="outline" size="sm" onClick={onCancel} loading={cancelling} disabled={job.cancelRequested}>
          {job.cancelRequested ? "Останавливаю…" : "Остановить"}
        </Button>
      </div>
    </div>
  );
}

function Stages({ stage, step }: { stage: StageIndex; step: string | null }) {
  return (
    <div className="flex flex-col gap-2" data-testid="ai-job-stages">
      <ol className="flex flex-col gap-1.5">
        {STAGES.map((label, i) => {
          const done = i < stage;
          const now = i === stage;
          return (
            <li key={label} aria-current={now ? "step" : undefined} className={cn("flex items-center gap-2 text-[13px]", now ? "font-semibold text-[var(--ink)]" : "text-[var(--text-muted)]")}>
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] tabular-nums",
                  done && "bg-[var(--surface-2)] text-[var(--ok)]",
                  now && "bg-[var(--accent)] text-[var(--accent-ink)]",
                  !done && !now && "border border-[var(--line-strong)]",
                )}
              >
                {done ? <Check className="h-3 w-3" aria-hidden /> : i + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden>
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500" style={{ width: `${stagePercent(stage)}%` }} />
      </div>
      {step && (
        <div className="truncate text-[12px] text-[var(--text-muted)]" data-testid="ai-job-step" title={step}>
          {step}
        </div>
      )}
    </div>
  );
}
