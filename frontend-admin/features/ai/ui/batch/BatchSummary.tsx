"use client";

import { Button } from "@shop/ui/admin-button";
import { nowMs } from "@shop/core/time";
import { cn } from "@/lib/cn";
import type { AiBatch } from "../../api-batch";
import { summaryParts, undoLeft } from "../../model/batch-view";
import { newIdemKey } from "../../model/idem";
import { useRetryFailedBatch, useUndoBatch } from "../../queries-batch";

const TONE = { ok: "text-[var(--ok)]", muted: "text-[var(--text-muted)]", bad: "text-[var(--danger-ink)]" } as const;

/**
 * Итог пакета, когда он закончился или есть что сделать: «Готово N · Не нашёл данных N · Сбой N», затем
 * «Проверить (N)», «Принять безопасное», «Повторить неудачные (N)» и «Отменить применение» (пока идут 24 часа).
 * «Принять безопасное» зависит от предмета пакета (карточки), поэтому его кнопку приносит вызывающий в `acceptSafe`.
 */
export function BatchSummary({ batch, onReview, acceptSafe }: { batch: AiBatch; onReview: () => void; acceptSafe?: React.ReactNode }) {
  const retry = useRetryFailedBatch();
  const undo = useUndoBatch();
  const parts = summaryParts(batch);
  const left = batch.undoable > 0 ? undoLeft(batch.undoUntil, nowMs()) : null;
  return (
    <div data-testid="batch-summary" className="flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-2 font-semibold">
        <span className="text-[var(--ink)]">Пакет {batch.status === "CANCELED" ? "остановлен" : "завершён"}:</span>
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
        {left && (
          <Button size="sm" variant="ghost" loading={undo.isPending} onClick={() => undo.mutate(batch.id)} data-testid="batch-undo">
            Отменить применение ({batch.undoable}, ещё {left})
          </Button>
        )}
      </div>
    </div>
  );
}
