"use client";

/**
 * «Отменить применение» на экране проверки одной задачи: пока у задачи есть неотменённое применение (24 часа) —
 * плашка со сроком, списком того, что вернётся (по журналу этого применения: поля, фото, переводы, статус, витрина),
 * и того, что не вернётся. После отмены задача снова ждёт проверки (`onUndone` — экран начинает ревью заново и
 * показывает итог `ApplyUndoReport`: что не отменено, потому что после применения это изменили вручную).
 */
import { nowMs } from "@shop/core/time";
import { Button } from "@shop/ui/admin-button";
import type { AiUndoResult } from "../api-batch";
import { undoLeft } from "../model/batch-view";
import { undoFieldsText, undoStaysText } from "../model/undo-fields";
import { useApplyLive, useUndoApplication } from "../queries-batch";

const BOX = "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-3 text-[13px]";

export function ApplyUndoBar({ jobId, onUndone }: { jobId: number; onUndone: (r: AiUndoResult) => void }) {
  const live = useApplyLive(jobId);
  const undo = useUndoApplication({ toast: false });
  const id = live.data?.id;
  const left = undoLeft(live.data?.undoUntil, nowMs());
  if (id == null || !left) return null;
  const changed = live.data?.changed ?? [];
  return (
    <div className={BOX} data-testid="apply-undo">
      <span className="flex min-w-0 flex-1 basis-[220px] flex-col gap-1">
        <span className="font-semibold text-[var(--ink)]">Применение можно отменить ещё {left}.</span>
        <span className="text-[var(--text-muted)]" data-testid="apply-undo-back">
          {changed.length ? `Вернётся: ${undoFieldsText(changed)}.` : "Применение ничего в карточке не изменило: отмена вернёт задачу на проверку."}
        </span>
        <span className="text-[var(--text-muted)]" data-testid="apply-undo-stays">
          Не вернётся: {undoStaysText(changed)}.
        </span>
      </span>
      <Button size="sm" variant="outline" loading={undo.isPending} onClick={() => undo.mutate(id, { onSuccess: onUndone })} data-testid="apply-undo-btn">
        Отменить применение
      </Button>
    </div>
  );
}

/** Итог отмены над ревью: что вернулось и что осталось, потому что после применения это правили вручную. */
export function ApplyUndoReport({ result, onClose }: { result: AiUndoResult | null; onClose: () => void }) {
  if (!result) return null;
  const kept = result.skippedFields;
  return (
    <div className={BOX} data-testid="apply-undo-report" role="status">
      <span className="flex min-w-0 flex-1 basis-[220px] flex-col gap-1">
        <span className="font-semibold text-[var(--ink)]">
          Применение отменено: {result.revertedFields.length ? `вернулось — ${undoFieldsText(result.revertedFields)}` : "возвращать было нечего"}.
        </span>
        {kept.length > 0 && (
          <span className="text-[var(--warn)]" data-testid="apply-undo-kept">
            Не отменено — после применения изменили вручную: {undoFieldsText(kept)}.
          </span>
        )}
      </span>
      <Button size="sm" variant="ghost" onClick={onClose} data-testid="apply-undo-report-close">
        Понятно
      </Button>
    </div>
  );
}
