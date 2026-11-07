"use client";

/**
 * «Возвраты и обмены» (V70) — каждый запуск мастера возврата и каждый обмен заказа, с картинками.
 * Самую новую активную запись можно отменить («Отменить возврат» / «Отменить обмен»), если покупатель передумал.
 */
import { useState } from "react";
import type { ReturnOrder, ReturnRecord } from "../../model/types";
import { useReturnDebtPaid } from "../../queries";
import { Fold } from "../Fold";
import { CancelReturnModal } from "./CancelReturnModal";
import { ReturnRecordCard } from "./ReturnRecordCard";

export function ReturnHistoryBlock({ order, onChanged }: { order: ReturnOrder; onChanged?: () => void }) {
  const records = order.admin?.returns ?? [];
  const [cancelling, setCancelling] = useState<ReturnRecord | null>(null);
  const debtPaid = useReturnDebtPaid(order.id, order.currency, () => onChanged?.());
  if (records.length === 0) return null;
  const cur = order.currency;

  return (
    // Open by default: a record can hold a debt («Деньги пришли») or the «Отменить» of the newest one.
    <Fold title="История возвратов" summary={`${records.length} ${records.length === 1 ? "запись" : "записей"}`} defaultOpen>
      <div className="flex flex-col gap-3">
        {records
          .slice()
          .reverse()
          .map((rec) => (
            <ReturnRecordCard
              key={rec.id}
              rec={rec}
              cur={cur}
              busy={debtPaid.isPending && debtPaid.variables?.returnId === rec.id}
              onDebtPaid={(r) => debtPaid.mutate({ returnId: r.id, debtMinor: r.debtMinor })}
              onCancel={setCancelling}
            />
          ))}
      </div>

      <CancelReturnModal
        order={order}
        record={cancelling}
        onClose={() => setCancelling(null)}
        onDone={() => onChanged?.()}
      />
    </Fold>
  );
}
