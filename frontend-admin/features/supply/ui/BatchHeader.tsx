"use client";

import { Button } from "@shop/ui/admin-button";
import { Ban, Landmark, PackageCheck, Pencil, Plane } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { BATCH_STATUS_LABEL, BATCH_STATUS_TONE, DISTRIBUTIONS, etaText, isOpenStatus, type Batch } from "@/features/procurement";
import { formatDateTime } from "@shop/core/time";

/** Заголовок карточки поставки: название, кнопки смены статуса, правка и отмена. */
export function BatchHeader({
  batch,
  statusPending,
  onStatus,
  onEdit,
  onArrive,
  onCancel,
}: {
  batch: Batch;
  statusPending: boolean;
  onStatus: (s: "IN_TRANSIT" | "CUSTOMS") => void;
  onEdit: () => void;
  onArrive: () => void;
  onCancel: () => void;
}) {
  const open = isOpenStatus(batch.status);
  return (
    <>
      {/* On a phone PageHeader hides its title (the top bar shows the section) — the batch name is needed here. */}
      <div className="mb-1 break-words font-display text-[20px] font-extrabold uppercase leading-tight text-[var(--ink)] lg:hidden">{batch.title}</div>
      <PageHeader
        title={batch.title}
        subtitle={`${batch.supplierName ?? "без поставщика"} · создана ${formatDateTime(batch.createdAt)}${batch.createdBy ? ` (${batch.createdBy})` : ""}`}
        actions={
          <>
            <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
              Изменить
            </Button>
            {open && (
              <>
                {batch.status !== "IN_TRANSIT" && (
                  <Button variant="outline" icon={<Plane className="h-4 w-4" />} loading={statusPending} onClick={() => onStatus("IN_TRANSIT")}>
                    В пути
                  </Button>
                )}
                {batch.status !== "CUSTOMS" && (
                  <Button variant="outline" icon={<Landmark className="h-4 w-4" />} loading={statusPending} onClick={() => onStatus("CUSTOMS")}>
                    На таможне
                  </Button>
                )}
                <Button variant="accent" icon={<PackageCheck className="h-4 w-4" />} onClick={onArrive}>
                  Приехала
                </Button>
                <Button variant="danger" icon={<Ban className="h-4 w-4" />} onClick={onCancel}>
                  Отменить
                </Button>
              </>
            )}
          </>
        }
      />
      <BatchStatusLine batch={batch} />
      <BatchNotes batch={batch} />
    </>
  );
}

function BatchStatusLine({ batch }: { batch: Batch }) {
  const distLabel = DISTRIBUTIONS.find((d) => d.value === batch.distribution)?.label ?? batch.distribution;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Badge tone={BATCH_STATUS_TONE[batch.status]} dot>
        {BATCH_STATUS_LABEL[batch.status]}
      </Badge>
      {batch.preorderOpen ? <Badge tone="accent">предзаказ открыт</Badge> : <Badge>без предзаказа</Badge>}
      <span className="text-[13px] text-[var(--text-muted)]">срок: {etaText(batch)}</span>
      <span className="text-[13px] text-[var(--text-muted)]">
        · {distLabel}, бронь {batch.holdHours} ч
      </span>
      {batch.arrivedAt && <span className="text-[13px] text-[var(--text-muted)]">· приехала {formatDateTime(batch.arrivedAt)}</span>}
      {batch.cancelledAt && <span className="text-[13px] text-[var(--text-muted)]">· отменена {formatDateTime(batch.cancelledAt)}</span>}
    </div>
  );
}

function BatchNotes({ batch }: { batch: Batch }) {
  if (!batch.privateNote && !batch.publicNote) return null;
  return (
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
  );
}
