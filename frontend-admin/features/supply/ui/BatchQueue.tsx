"use client";

import { QueryState } from "@/components/ui/QueryState";
import { CsvButton, SubscribersList, type Batch } from "@/features/procurement";
import { useBatchSubscribers } from "../queries";

/** Блок «Кто ждёт»: очередь покупателей на товары поставки, выгрузка в CSV. */
export function BatchQueue({ batch }: { batch: Batch }) {
  const subsQ = useBatchSubscribers(batch.id);
  const people = batch.items.reduce((n, i) => n + i.waitingPeople, 0);
  const qty = batch.items.reduce((n, i) => n + i.waitingQty, 0);
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="tabular text-[13px] text-[var(--text-muted)]">{people ? `ждут ${people} чел. — ${qty} шт` : "пока никто не ждёт"}</span>
        {people > 0 && (
          <span className="ml-auto">
            <CsvButton scope={{ batchId: batch.id }} />
          </span>
        )}
      </div>
      {people > 0 && (
        <QueryState isLoading={subsQ.isLoading} isError={subsQ.isError} error={subsQ.error} refetch={subsQ.refetch}>
          <SubscribersList subs={subsQ.data ?? []} showLine={batch.items.length > 1} />
        </QueryState>
      )}
    </>
  );
}
