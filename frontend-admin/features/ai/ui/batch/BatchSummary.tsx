"use client";

import { Button } from "@shop/ui/admin-button";
import { nowMs } from "@shop/core/time";
import { cn } from "@/lib/cn";
import type { AiBatch } from "../../api-batch";
import { summaryParts, summaryTitle, undoLeft } from "../../model/batch-view";
import { newIdemKey } from "../../model/idem";
import { useRetryFailedBatch, useUndoBatch } from "../../queries-batch";

const TONE = { ok: "text-[var(--ok)]", muted: "text-[var(--text-muted)]", bad: "text-[var(--danger-ink)]" } as const;

/**
 * Итог пакета, когда он закончился или есть что сделать: «Готово N · Не нашёл данных N · Сбой N», затем
 * «Проверить (N)», «Принять безопасное», «Повторить неудачные (N)» и «Отменить применение» (всё, что применено по
 * пакету и ещё не отменено, пока идут 24 часа); под ними — «Подробно» с итогом по предметам (`report`).
 * «Принять безопасное» зависит от предмета пакета (карточки), поэтому его кнопку приносит вызывающий в `acceptSafe`.
 */
export function BatchSummary({
  batch,
  onReview,
  acceptSafe,
  manual,
  report,
  onUndone,
}: {
  batch: AiBatch;
  onReview: () => void;
  acceptSafe?: React.ReactNode;
  manual?: React.ReactNode;
  /** Подробный итог по предметам: под сводкой, раскрывается по «Подробно». */
  report?: React.ReactNode;
  /** После «Отменить применение»: значения предметов вернулись — их кэш сбрасывает предмет пакета. */
  onUndone?: () => void;
}) {
  const retry = useRetryFailedBatch();
  const undo = useUndoBatch();
  const parts = summaryParts(batch);
  const left = batch.undoable > 0 ? undoLeft(batch.undoUntil, nowMs()) : null;
  return (
    <div data-testid="batch-summary" className="flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-2 font-semibold">
        <span className="text-[var(--ink)]">{summaryTitle(batch)}</span>
        {parts.map((p, i) => (
          <span key={p.label} className={cn("tabular-nums", TONE[p.tone])}>
            {i > 0 && <span className="text-[var(--text-muted)]">· </span>}
            {p.label} {p.n}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {batch.ready > 0 && (
          <Button size="sm" variant="surface" onClick={onReview} data-testid="batch-review">
            Проверить ({batch.ready})
          </Button>
        )}
        {acceptSafe}
        {batch.retryable > 0 && (
          <Button
            size="sm"
            variant="outline"
            loading={retry.isPending}
            onClick={() => retry.mutate({ id: batch.id, idemKey: newIdemKey() })}
            data-testid="batch-retry"
          >
            Повторить неудачные ({batch.retryable})
          </Button>
        )}
        {manual}
        {left && (
          <Button size="sm" variant="ghost" loading={undo.isPending} onClick={() => undo.mutate(batch.id, { onSuccess: () => onUndone?.() })} data-testid="batch-undo">
            Отменить применение ({batch.undoable}, ещё {left})
          </Button>
        )}
      </div>
      {report && (
        <details className="min-w-0" data-testid="batch-report-toggle">
          <summary className="cursor-pointer select-none text-[12.5px] font-semibold text-[var(--text-muted)]">Подробно</summary>
          <div className="pt-2">{report}</div>
        </details>
      )}
    </div>
  );
}
