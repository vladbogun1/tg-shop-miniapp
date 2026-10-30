"use client";

/**
 * Карточка поставки (route "/preorders/{id}"): позиции (заказано / пришло / ждут / остаток / цена),
 * очередь подписчиков, кнопки «В пути» · «На таможне» · «Приехала» · «Отменить», правка.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, PackageCheck, Pencil, Plane, Landmark, Ban } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/orders";
import { money } from "@/lib/money";
import { Image } from "@/lib/image";
import {
  BATCH_STATUS_LABEL,
  BATCH_STATUS_TONE,
  DISTRIBUTIONS,
  PREORDERS_KEY,
  costUahMinor,
  etaText,
  fxToInput,
  isOpenStatus,
  lineTitle,
  preordersApi,
  type Batch,
} from "@/lib/preorders";
import { toast } from "@shop/ui/toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@shop/ui/admin-button";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { QueryState } from "@/components/ui/QueryState";
import { Tabs } from "@/components/ui/Tabs";
import { Toggle } from "@/components/ui/Toggle";
import { useFinanceAccess } from "@/lib/costing";
import { BatchMoneyTab } from "@/components/preorders/BatchMoneyTab";
import { BatchSalesTab } from "@/components/preorders/BatchSalesTab";
import { ArriveModal } from "@/components/preorders/ArriveModal";
import { BatchFormModal } from "@/components/preorders/BatchFormModal";
import { CsvButton } from "@/components/preorders/CsvButton";
import { SubscribersList } from "@/components/preorders/SubscribersList";
import { ProductStateChips, useBatchProductTools, useBatchProducts } from "@/components/preorders/BatchItemProduct";

export default function BatchPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const q = useQuery({ queryKey: [...PREORDERS_KEY, "batch", id], queryFn: () => preordersApi.batch(id), enabled: !!id });
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
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const open = isOpenStatus(batch.status);
  const finance = useFinanceAccess();
  const [tab, setTab] = useState<"main" | "money" | "sales">("main");
  const shownTab = finance ? tab : "main";

  const subsQ = useQuery({
    queryKey: [...PREORDERS_KEY, "batch-subs", batch.id],
    queryFn: () => preordersApi.subscribers(batch.id),
  });

  const setStatus = useMutation({
    mutationFn: (s: "IN_TRANSIT" | "CUSTOMS") => preordersApi.setStatus(batch.id, s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PREORDERS_KEY });
      toast.success("Статус обновлён");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Не удалось"),
  });

  const distLabel = DISTRIBUTIONS.find((d) => d.value === batch.distribution)?.label ?? batch.distribution;
  const totalPeople = batch.items.reduce((n, i) => n + i.waitingPeople, 0);
  const totalQty = batch.items.reduce((n, i) => n + i.waitingQty, 0);
  const products = useBatchProducts(batch.items.map((i) => i.productId));
  const tools = useBatchProductTools();

  return (
    <>
      {/* On a phone PageHeader hides its title (the top bar shows the section) — the batch name is needed here. */}
      <div className="mb-1 break-words font-display text-[20px] font-extrabold uppercase leading-tight text-[var(--ink)] lg:hidden">{batch.title}</div>
      <PageHeader
        title={batch.title}
        subtitle={`${batch.supplierName ?? "без поставщика"} · создана ${formatDateTime(batch.createdAt)}${batch.createdBy ? ` (${batch.createdBy})` : ""}`}
        actions={
          <>
            <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
              Изменить
            </Button>
            {open && (
              <>
                {batch.status !== "IN_TRANSIT" && (
                  <Button variant="outline" icon={<Plane className="h-4 w-4" />} loading={setStatus.isPending} onClick={() => setStatus.mutate("IN_TRANSIT")}>
                    В пути
                  </Button>
                )}
                {batch.status !== "CUSTOMS" && (
                  <Button variant="outline" icon={<Landmark className="h-4 w-4" />} loading={setStatus.isPending} onClick={() => setStatus.mutate("CUSTOMS")}>
                    На таможне
                  </Button>
                )}
                <Button variant="accent" icon={<PackageCheck className="h-4 w-4" />} onClick={() => setArriving(true)}>
                  Приехала
                </Button>
                <Button variant="danger" icon={<Ban className="h-4 w-4" />} onClick={() => setCancelling(true)}>
                  Отменить
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={BATCH_STATUS_TONE[batch.status]} dot>
          {BATCH_STATUS_LABEL[batch.status]}
        </Badge>
        {batch.preorderOpen ? <Badge tone="accent">предзаказ открыт</Badge> : <Badge>без предзаказа</Badge>}
        <span className="text-[13px] text-[var(--text-muted)]">срок: {etaText(batch)}</span>
        <span className="text-[13px] text-[var(--text-muted)]">· {distLabel}, бронь {batch.holdHours} ч</span>
        {batch.arrivedAt && <span className="text-[13px] text-[var(--text-muted)]">· приехала {formatDateTime(batch.arrivedAt)}</span>}
        {batch.cancelledAt && <span className="text-[13px] text-[var(--text-muted)]">· отменена {formatDateTime(batch.cancelledAt)}</span>}
      </div>

      {(batch.privateNote || batch.publicNote) && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {batch.privateNote && (
            <div className="card-2 p-3 text-[13px]">
              <div className="field-label mb-1">Для себя</div>
              <p className="whitespace-pre-wrap break-words text-[var(--text)]">{batch.privateNote}</p>
            </div>
          )}
          {batch.publicNote && (
            <div className="card-2 p-3 text-[13px]">
              <div className="field-label mb-1">Покупателям</div>
              <p className="whitespace-pre-wrap break-words text-[var(--text)]">{batch.publicNote}</p>
            </div>
          )}
        </div>
      )}

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
      {shownTab === "main" && (
      <>
      <h2 className="mb-2 font-display text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Позиции</h2>
      <div className="mb-5 flex min-w-0 flex-col gap-2">
        {batch.items.map((i) => {
          const cost = batch.moneyVisible ? costUahMinor(i.unitPriceFx, batch.fxRate) : null;
          const enough = i.waitingQty <= i.qtyOrdered;
          const p = products.byId.get(i.productId);
          return (
            <div key={i.id} className="card flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <button
                type="button"
                disabled={!p}
                onClick={() => p && tools.openPreview(p)}
                title={p ? "Быстрый просмотр" : undefined}
                className="group flex min-w-0 flex-1 basis-52 items-center gap-3 text-left enabled:cursor-pointer"
              >
                <Image src={i.imageUrl} alt={i.title} size={120} className="h-12 w-12 shrink-0 rounded-[var(--r-md)] border border-[var(--line)] transition group-enabled:group-hover:border-[var(--accent)]" />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-[var(--text)] group-enabled:group-hover:text-[var(--accent-hi)]">
                    {lineTitle(i.title, i.variantName)}
                  </span>
                  <ProductStateChips p={p} loading={products.loading} />
                </span>
              </button>
              <Cell label="Заказано" value={`${i.qtyOrdered}`} />
              <Cell label="Пришло" value={i.qtyArrived != null ? `${i.qtyArrived}` : "—"} />
              <Cell label="Ждут" value={`${i.waitingPeople} чел / ${i.waitingQty} шт`} warn={open && !enough} accent={i.waitingPeople > 0} />
              <Cell label="На складе" value={`${i.stock}`} />
              <Cell label="Цена продажи" value={money(i.priceMinor)} />
              {batch.moneyVisible && (
                <Cell
                  label="Закупка"
                  value={i.unitPriceFx != null ? `${fxToInput(i.unitPriceFx)} ${batch.currency ?? ""}` : "—"}
                  sub={cost != null ? `≈ ${money(cost)}/шт` : undefined}
                />
              )}
              {p && (
                <div className="flex items-center gap-3">
                  <Toggle
                    checked={!!p.active}
                    disabled={tools.busy === p.id}
                    onChange={(v) => tools.setActive(p, v)}
                    label="Показывать"
                  />
                  <Button variant="ghost" size="icon" icon={<Pencil className="h-4 w-4" />} onClick={() => tools.openEditor(p)} aria-label="Редактировать товар" title="Редактировать товар" />
                </div>
              )}
            </div>
          );
        })}
      </div>

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
      )}

      {tools.ui}
      <BatchFormModal open={editing} onClose={() => setEditing(false)} batch={batch} />
      {open && <ArriveModal open={arriving} onClose={() => setArriving(false)} batch={batch} />}
      <CancelModal open={cancelling} onClose={() => setCancelling(false)} batch={batch} waiting={totalPeople} />
    </>
  );
}

function Cell({ label, value, sub, accent, warn }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="min-w-[5.5rem]">
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
      <div className={"tabular font-display text-[14px] font-bold " + (warn ? "text-[var(--warn)]" : accent ? "text-[var(--accent-hi)]" : "text-[var(--ink)]")}>{value}</div>
      {sub && <div className="tabular text-[11px] text-[var(--text-faint)]">{sub}</div>}
    </div>
  );
}

function CancelModal({ open, onClose, batch, waiting }: { open: boolean; onClose: () => void; batch: Batch; waiting: number }) {
  const qc = useQueryClient();
  const [closeQueue, setCloseQueue] = useState(false);
  const cancel = useMutation({
    mutationFn: () => preordersApi.cancel(batch.id, closeQueue),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PREORDERS_KEY });
      toast.success("Поставка отменена");
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Не удалось отменить"),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Отменить поставку?"
      footer={
        <>
          <ModalCancel>Назад</ModalCancel>
          <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Отменить поставку
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-[14px] text-[var(--text-muted)]">
        <p>
          «{batch.title}» перестанет быть открытой. Ждущих сейчас: {waiting} чел. Если очередь оставить, люди продолжат ждать товар без срока.
        </p>
        <Toggle checked={closeQueue} onChange={setCloseQueue} label="Закрыть очередь (ждущие выйдут из неё)" />
      </div>
    </Modal>
  );
}
