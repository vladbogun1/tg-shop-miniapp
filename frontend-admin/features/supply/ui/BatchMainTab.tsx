"use client";

import { QueryState } from "@/components/ui/QueryState";
import { CsvButton, SubscribersList, isOpenStatus, type Batch } from "@/features/procurement";
import { useBatchSubscribers } from "../queries";
import { BatchItems } from "./BatchItems";

/** Вкладка «Позиции и очередь»: позиции поставки и очередь ждущих покупателей с выгрузкой в CSV. */
export function BatchMainTab({ batch }: { batch: Batch }) {
  const subsQ = useBatchSubscribers(batch.id);
  const totalPeople = batch.items.reduce((n, i) => n + i.waitingPeople, 0);
  const totalQty = batch.items.reduce((n, i) => n + i.waitingQty, 0);
  return (
    <>
      <h2 className="mb-2 font-display text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Позиции</h2>
      <BatchItems batch={batch} open={isOpenStatus(batch.status)} />

      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Очередь</h2>
        <span className="tabular text-[12.5px] text-[var(--text-faint)]">
          ждут {totalPeople} чел / {totalQty} шт
        </span>
        <span className="ml-auto">
          <CsvButton scope={{ batchId: batch.id }} />
        </span>
      </div>
      <QueryState isLoading={subsQ.isLoading} isError={subsQ.isError} error={subsQ.error} refetch={subsQ.refetch}>
        <SubscribersList subs={subsQ.data ?? []} showLine={batch.items.length > 1} />
      </QueryState>
    </>
  );
}
