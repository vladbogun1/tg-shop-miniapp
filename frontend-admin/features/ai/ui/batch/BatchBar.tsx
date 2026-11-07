"use client";

import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";
import type { AiBatch } from "../../api-batch";
import { barText, canResume, progressPercent } from "../../model/batch-view";
import { useCancelBatch, usePauseBatch, useResumeBatch } from "../../queries-batch";

/**
 * Полоса идущего пакета над страницей: «Идёт пакет: 12 из 30 · Остановить». На паузе — причина, «Продолжить» и
 * «Закончить» (то, что готово, остаётся на проверку), а также ручной путь для оставшегося (`manual`). Только ход; итог и действия с результатом — в `BatchSummary`.
 */
export function BatchBar({ batch, onReview, manual }: { batch: AiBatch; onReview?: () => void; manual?: React.ReactNode }) {
  const pause = usePauseBatch();
  const resume = useResumeBatch();
  const cancel = useCancelBatch();
  const paused = batch.status === "PAUSED";
  const pct = progressPercent(batch);
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="batch-bar"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-md)] border bg-[var(--surface)] px-3 py-2 text-[13px]",
        paused ? "border-[var(--warn)]" : "border-[var(--line-strong)]",
      )}
    >
      {paused ? <Sparkles className="h-4 w-4 shrink-0 text-[var(--warn)]" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" />}
      <span className="min-w-0 flex-1 basis-48 font-semibold text-[var(--ink)]" data-testid="batch-bar-text">
        {barText(batch)}
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)] sm:order-last" aria-hidden>
        <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {batch.ready > 0 && onReview && (
          <Button size="sm" variant="surface" onClick={onReview} data-testid="batch-review">
            Проверить ({batch.ready})
          </Button>
        )}
        {!paused && (
          <Button size="sm" variant="outline" loading={pause.isPending} onClick={() => pause.mutate(batch.id)} data-testid="batch-stop">
            Остановить
          </Button>
        )}
        {canResume(batch) && (
          <Button size="sm" variant="accent" loading={resume.isPending} onClick={() => resume.mutate(batch.id)} data-testid="batch-resume">
            Продолжить
          </Button>
        )}
        {paused && manual}
        {paused && (
          <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(batch.id)} data-testid="batch-cancel">
            Закончить
          </Button>
        )}
      </div>
    </div>
  );
}
