"use client";

import { Button } from "@shop/ui/admin-button";
import { Plus, Truck } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { BATCH_STATUS_LABEL, BATCH_STATUS_TONE, etaText, type BatchFilter, type BatchSummary } from "@/features/procurement";
import { formatDateTime } from "@shop/core/time";
import { useBatchesList } from "../queries";
import { Stat } from "./BatchStat";

export function BatchList({ filter, onCreate }: { filter: BatchFilter; onCreate: () => void }) {
  const q = useBatchesList(filter);
  const empty = {
    open: "Открытых поставок нет",
    arrived: "Приехавших поставок пока нет",
    cancelled: "Отменённых поставок нет",
  } as Record<string, string>;
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка поставок">
      {q.data && q.data.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={empty[filter]}
          description={
            filter === "open" ? "Создайте поставку, когда закажете партию у завода: покупатели увидят срок и смогут встать в очередь." : undefined
          }
          action={
            filter === "open" ? (
              <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={onCreate}>
                Новая поставка
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {q.data?.map((b) => (
            <BatchRow key={b.id} b={b} />
          ))}
        </div>
      )}
    </QueryState>
  );
}

function BatchRow({ b }: { b: BatchSummary }) {
  return (
    <Link href={`/preorders/${b.id}`} className="card card-hover flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3.5">
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 break-words text-[15px] font-semibold text-[var(--text)]">{b.title}</h3>
          <Badge tone={BATCH_STATUS_TONE[b.status]} dot>
            {BATCH_STATUS_LABEL[b.status]}
          </Badge>
          {!b.preorderOpen && b.status !== "ARRIVED" && b.status !== "CANCELLED" && <Badge>закупка без предзаказа</Badge>}
        </div>
        <div className="mt-1 text-[12.5px] text-[var(--text-muted)]">
          {b.supplierName ?? "без поставщика"}
          {b.arrivedAt ? ` · приехала ${formatDateTime(b.arrivedAt)}` : ` · срок: ${etaText(b)}`}
        </div>
      </div>
      <Stat label="Позиций" value={`${b.itemsCount}`} />
      <Stat label="Заказано" value={`${b.qtyOrdered} шт`} />
      <Stat label="Ждут" value={`${b.waitingPeople} чел / ${b.waitingQty} шт`} accent={b.waitingPeople > 0} />
    </Link>
  );
}
