"use client";

import { QuickReviewDeck, type AiBatchRow } from "@/features/ai";
import { Button } from "@shop/ui/admin-button";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { cardsKeys } from "../../keys";
import { productsLine } from "./use-manual-start";
import { CardBatchReport } from "../ai/batch/CardBatchReport";
import { CardFeedItem } from "../ai/batch/CardFeedItem";
import { FeedReplaceToggle } from "../ai/batch/FeedReplaceToggle";
import { SafeAcceptButton } from "../ai/batch/SafeAcceptButton";
import { useFeedAccept } from "../ai/batch/use-feed-accept";
import { PhotoSummary } from "../photos/PhotoSummary";
import type { ManualBatchState } from "./use-manual-batch";

/**
 * Всё проверено: итог пакета (как у прежнего мастера — записано, отклонено, без ответа, что сервер отбросил, со
 * ссылками) и дальше — «Закончить» или, если выбранное не влезло в один пакет, «Следующий пакет».
 */
function Finished({ m, onClose, onNext }: { m: ManualBatchState; onClose: () => void; onNext: (() => void) | null }) {
  const left = m.unanswered.length;
  const rest = m.draft?.rest.length ?? 0;
  return (
    <div className="flex flex-col gap-3" data-testid="manual-finished">
      <p className="text-[14px] text-[var(--text)]">
        Всё проверено.{left > 0 && ` Без ответа осталось ${left} — их можно дописать в частях.`}
        {rest > 0 && ` Ещё ${productsLine(rest)} ждут следующего пакета.`}
      </p>
      {m.batch && <CardBatchReport batch={m.batch.batch} unanswered={m.unanswered} />}
      <div className="flex flex-wrap gap-2">
        {left > 0 && (
          <Button variant="surface" disabled={m.busy} onClick={() => void m.goPart(m.draft?.part ?? 0)}>
            К частям
          </Button>
        )}
        <Button variant={onNext ? "surface" : "accent"} loading={m.busy} onClick={onClose} data-testid="manual-finish">
          Закончить
        </Button>
        {onNext && (
          <Button variant="accent" loading={m.busy} onClick={onNext} data-testid="manual-next">
            Следующий пакет ({rest})
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Проверка ручного пакета: те же задачи, что у пакета ИИ, и та же лента «Принять · Позже · Править» (фото, замена
 * характеристик, «Отменить»), «Принять безопасное» с отменой на 24 часа. «Править» уводит на обычный экран проверки.
 */
export function ManualReviewStage({ m, onClose, onNext, onEdit }: { m: ManualBatchState; onClose: () => void; onNext: (() => void) | null; onEdit: (jobId: number) => void }) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: cardsKeys.manual() });
  const feed = useFeedAccept({ batchId: m.batch?.batch.id ?? null, schema: m.schema, onChanged: refresh });
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
          {m.batch && <SafeAcceptButton batch={m.batch.batch} items={m.items} schema={m.schema} onChanged={refresh} />}
          <Button variant="surface" size="sm" icon={<ChevronLeft className="h-4 w-4" />} disabled={m.busy} onClick={() => void m.goPart(m.draft?.part ?? 0)}>
            К частям
          </Button>
        </div>
      </div>
      <section className="card p-4 sm:p-5">
        <QuickReviewDeck<AiBatchRow>
          rows={m.rows}
          item={(row) => <CardFeedItem row={row} replace={feed.replace} />}
          onAccept={feed.accept}
          onEdit={(row) => onEdit(row.id)}
          toolbar={<FeedReplaceToggle replace={feed.replace} setReplace={feed.setReplace} />}
          status={<PhotoSummary photos={feed.photos} />}
          empty={<Finished m={m} onClose={onClose} onNext={onNext} />}
        />
      </section>
    </div>
  );
}
