"use client";

/**
 * Карточка поставки (route "/preorders/{id}"): позиции (заказано / пришло / ждут / остаток / цена),
 * очередь подписчиков, кнопки «В пути» · «На таможне» · «Приехала» · «Отменить», правка.
 */
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ProductPickModal } from "@/components/ProductPickModal";
import { QueryState } from "@/components/ui/QueryState";
import { Tabs } from "@/components/ui/Tabs";
import { BatchFormModal, isOpenStatus, useFinanceAccess, type Batch } from "@/features/procurement";
import { useBatch, useSetBatchStatus } from "../queries";
import { ArriveModal } from "./ArriveModal";
import { BatchHeader } from "./BatchHeader";
import { BatchMainTab } from "./BatchMainTab";
import { BatchMoneyTab } from "./BatchMoneyTab";
import { BatchSalesTab } from "./BatchSalesTab";
import { CancelBatchModal } from "./CancelBatchModal";

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

type TabKey = "main" | "money" | "sales";

function BatchView({ batch }: { batch: Batch }) {
  const [editing, setEditing] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [tab, setTab] = useState<TabKey>("main");
  const finance = useFinanceAccess();
  const shownTab = finance ? tab : "main";
  const setStatus = useSetBatchStatus(batch.id);
  const waiting = batch.items.reduce((n, i) => n + i.waitingPeople, 0);

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

      {finance && (
        <Tabs
          className="mb-4"
          value={shownTab}
          onChange={setTab}
          items={[
            { value: "main", label: "Позиции и очередь" },
            { value: "money", label: "Деньги" },
            { value: "sales", label: "Продажи" },
          ]}
        />
      )}
      {shownTab === "money" && <BatchMoneyTab batchId={batch.id} />}
      {shownTab === "sales" && <BatchSalesTab batchId={batch.id} />}
      {shownTab === "main" && <BatchMainTab batch={batch} />}

      <BatchFormModal open={editing} onClose={() => setEditing(false)} batch={batch} ProductPicker={ProductPickModal} />
      {isOpenStatus(batch.status) && <ArriveModal open={arriving} onClose={() => setArriving(false)} batch={batch} />}
      <CancelBatchModal open={cancelling} onClose={() => setCancelling(false)} batch={batch} waiting={waiting} />
    </>
  );
}
