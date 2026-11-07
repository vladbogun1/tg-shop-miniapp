"use client";

/**
 * «Отменить применение» на экране проверки одной задачи: пока у задачи есть неотменённое применение (24 часа) —
 * плашка со сроком и кнопкой. После отмены задача снова ждёт проверки (`onUndone` — экран начинает ревью заново).
 */
import { nowMs } from "@shop/core/time";
import { Button } from "@shop/ui/admin-button";
import { undoLeft } from "../model/batch-view";
import { useApplyLive, useUndoApplication } from "../queries-batch";

export function ApplyUndoBar({ jobId, note, onUndone }: { jobId: number; note: string; onUndone: () => void }) {
  const live = useApplyLive(jobId);
  const undo = useUndoApplication();
  const id = live.data?.id;
  const left = undoLeft(live.data?.undoUntil, nowMs());
  if (id == null || !left) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-3 text-[13px]"
      data-testid="apply-undo"
    >
      <span className="min-w-0 flex-1 basis-[220px]">
        <span className="font-semibold text-[var(--ink)]">Применение можно отменить ещё {left}.</span>{" "}
        <span className="text-[var(--text-muted)]">{note}</span>
      </span>
      <Button size="sm" variant="outline" loading={undo.isPending} onClick={() => undo.mutate(id, { onSuccess: onUndone })} data-testid="apply-undo-btn">
        Отменить применение
      </Button>
    </div>
  );
}
