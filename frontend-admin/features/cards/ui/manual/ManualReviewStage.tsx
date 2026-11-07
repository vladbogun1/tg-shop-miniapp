"use client";

import { QuickReviewDeck, type AiBatchRow } from "@/features/ai";
import { Button } from "@shop/ui/admin-button";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { cardsKeys } from "../../keys";
import { CardFeedItem } from "../ai/batch/CardFeedItem";
import { SafeAcceptButton } from "../ai/batch/SafeAcceptButton";
import type { ManualBatchState } from "./use-manual-batch";

function Finished({ m, onClose }: { m: ManualBatchState; onClose: () => void }) {
  const left = m.unanswered.length;
  return (
    <div className="flex flex-col gap-3" data-testid="manual-finished">
      <p className="text-[14px] text-[var(--text)]">
        Всё проверено. Решено по этому пакету: {m.decided}.{left > 0 && ` Без ответа осталось ${left} — их можно дописать в частях.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {left > 0 && (
          <Button variant="surface" disabled={m.busy} onClick={() => void m.goPart(m.draft?.part ?? 0)}>
            К частям
          </Button>
        )}
        <Button variant="accent" loading={m.busy} onClick={onClose} data-testid="manual-finish">
          Закончить
        </Button>
      </div>
    </div>
  );
}

/**
 * Проверка ручного пакета: те же задачи, что у пакета ИИ, и та же лента «Принять · Позже · Править»,
 * «Принять безопасное» с отменой на 24 часа. «Править» уводит на обычный экран проверки задачи.
 */
export function ManualReviewStage({ m, onClose, onEdit }: { m: ManualBatchState; onClose: () => void; onEdit: (jobId: number) => void }) {
  const qc = useQueryClient();
  const total = m.batch?.items.length ?? 0;
  const answered = total - m.unanswered.length;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-[20px] font-bold text-[var(--ink)]">Вручную: проверка</h2>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]" data-testid="manual-review-sub">
            Ответов {answered} из {total} · решено {m.decided} · осталось {m.rows.length}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Всегда в дереве: после записи «осталось 0», а окно с итогом и «Отменить применение» должно остаться. */}
          {m.batch && (
            <SafeAcceptButton batch={m.batch.batch} items={m.items} schema={m.schema} onChanged={() => void qc.invalidateQueries({ queryKey: cardsKeys.manual() })} />
          )}
          <Button variant="surface" size="sm" icon={<ChevronLeft className="h-4 w-4" />} disabled={m.busy} onClick={() => void m.goPart(m.draft?.part ?? 0)}>
            К частям
          </Button>
        </div>
      </div>
      <section className="card p-4 sm:p-5">
        <QuickReviewDeck<AiBatchRow>
          rows={m.rows}
          item={(row) => <CardFeedItem row={row} />}
          onAccept={m.accept}
          onEdit={(row) => onEdit(row.id)}
          empty={<Finished m={m} onClose={onClose} />}
        />
      </section>
    </div>
  );
}
