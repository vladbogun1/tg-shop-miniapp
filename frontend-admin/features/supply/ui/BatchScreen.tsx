"use client";

/**
 * Карточка поставки (route "/preorders/{id}") — одна страница блоками, без вкладок: шапка со статусом и одной главной
 * кнопкой, итог (если приехала), «Что в поставке», «Кто ждёт», «Закупка и расходы» и «Продажи» (с правом «Финансы»).
 */
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ProductPickModal } from "@/features/product";
import { QueryState } from "@/components/ui/QueryState";
import { BatchFormModal, isOpenStatus, useFinanceAccess, type Batch } from "@/features/procurement";
import { useBatch, useSetBatchStatus } from "../queries";
import { ArriveModal } from "./ArriveModal";
import { BatchHeader } from "./BatchHeader";
import { BatchItems } from "./BatchItems";
import { BatchMoneyTab } from "./BatchMoneyTab";
import { BatchQueue } from "./BatchQueue";
import { BatchResult } from "./BatchResult";
import { BatchSalesTab } from "./BatchSalesTab";
import { BatchJumps, BatchSection } from "./BatchSection";
import { CancelBatchModal } from "./CancelBatchModal";
import { NewCardsBanner } from "./NewCardsBanner";

export function BatchScreen() {
  const params = useParams<{ id: string }>();
  const q = useBatch(params?.id ?? "");
  return (
    <div className="min-w-0">
      <Link href="/preorders" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text)]">
        <ArrowLeft className="h-4 w-4" /> Все поставки
      </Link>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка поставки">
        {q.data && <BatchView batch={q.data} />}
      </QueryState>
    </div>
  );
}

function BatchView({ batch }: { batch: Batch }) {
  const [editing, setEditing] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const finance = useFinanceAccess();
  const setStatus = useSetBatchStatus(batch.id);
  const waiting = batch.items.reduce((n, i) => n + i.waitingPeople, 0);
  const arrived = batch.status === "ARRIVED";
  const jumps = [
    { id: "items", label: "Что в поставке" },
    { id: "queue", label: waiting ? `Кто ждёт · ${waiting}` : "Кто ждёт" },
    ...(finance ? [{ id: "money", label: "Закупка и расходы" }] : []),
    ...(finance && arrived ? [{ id: "sales", label: "Продажи" }] : []),
  ];

  return (
    <>
      <BatchHeader
        batch={batch}
        statusPending={setStatus.isPending}
        onStatus={(s) => setStatus.mutate(s)}
        onEdit={() => setEditing(true)}
        onArrive={() => setArriving(true)}
        onCancel={() => setCancelling(true)}
      />
      <NewCardsBanner batch={batch} />
      {finance && arrived && <BatchResult batchId={batch.id} />}
      <BatchJumps items={jumps} />

      <BatchSection id="items" title="Что в поставке">
        <BatchItems batch={batch} open={isOpenStatus(batch.status)} />
      </BatchSection>
      <BatchSection
        id="queue"
        title="Кто ждёт"
        hint="Покупатели, которые нажали «Сообщить о поступлении» или заказали заранее. Когда поставка приедет, бот им напишет."
      >
        <BatchQueue batch={batch} />
      </BatchSection>
      {finance && (
        <BatchSection
          id="money"
          title="Закупка и расходы"
          hint="Почём купили и сколько ушло на доставку — отсюда считается, во сколько обошлась 1 шт."
        >
          <BatchMoneyTab batchId={batch.id} />
        </BatchSection>
      )}
      {finance && arrived && (
        <BatchSection id="sales" title="Продажи по товарам">
          <BatchSalesTab batchId={batch.id} />
        </BatchSection>
      )}

      <BatchFormModal open={editing} onClose={() => setEditing(false)} batch={batch} ProductPicker={ProductPickModal} />
      {isOpenStatus(batch.status) && <ArriveModal open={arriving} onClose={() => setArriving(false)} batch={batch} />}
      <CancelBatchModal open={cancelling} onClose={() => setCancelling(false)} batch={batch} waiting={waiting} />
    </>
  );
}
