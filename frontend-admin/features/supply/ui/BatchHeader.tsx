"use client";

import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { Ban, Check, Landmark, PackageCheck, Pencil, Plane } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActionMenu, type MenuItem } from "@/components/ui/ActionMenu";
import { Badge } from "@/components/ui/Badge";
import { DISTRIBUTIONS, etaText, isOpenStatus, type Batch } from "@/features/procurement";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@shop/core/time";
import { supplierInSubtitle } from "../model/format";

type Moving = "IN_TRANSIT" | "CUSTOMS";

const STEPS: { status: Batch["status"]; label: string }[] = [
  { status: "ORDERED", label: "Заказана" },
  { status: "IN_TRANSIT", label: "В пути" },
  { status: "CUSTOMS", label: "На таможне" },
  { status: "ARRIVED", label: "Приехала" },
];

/**
 * Шапка поставки: шаги «Заказана → В пути → На таможне → Приехала», одна главная кнопка («Приехала» — пока едет),
 * всё редкое и опасное («Изменить», «В пути», «На таможне», «Отменить») — в «⋯» и с подтверждением.
 */
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
  onStatus: (s: Moving) => void;
  onEdit: () => void;
  onArrive: () => void;
  onCancel: () => void;
}) {
  const open = isOpenStatus(batch.status);
  const confirm = useConfirm();
  const supplier = supplierInSubtitle(batch.title, batch.supplierName);
  const created = `создана ${formatDateTime(batch.createdAt)}${batch.createdBy ? ` (${batch.createdBy})` : ""}`;

  async function move(s: Moving) {
    const label = s === "IN_TRANSIT" ? "«В пути»" : "«На таможне»";
    if (
      await confirm({
        title: `Отметить ${label}?`,
        message: "Поменяется только статус поставки: остаток и брони не трогаем.",
        confirmLabel: "Отметить",
      })
    ) {
      onStatus(s);
    }
  }

  const actions: MenuItem[] = [
    {
      key: "edit",
      label: "Изменить поставку",
      icon: <Pencil className="h-4 w-4" />,
      onSelect: onEdit,
    },
    ...(open && batch.status !== "IN_TRANSIT"
      ? [
          {
            key: "transit",
            label: "Отметить «В пути»",
            icon: <Plane className="h-4 w-4" />,
            onSelect: () => void move("IN_TRANSIT"),
          },
        ]
      : []),
    ...(open && batch.status !== "CUSTOMS"
      ? [
          {
            key: "customs",
            label: "Отметить «На таможне»",
            icon: <Landmark className="h-4 w-4" />,
            onSelect: () => void move("CUSTOMS"),
          },
        ]
      : []),
    ...(open
      ? [
          {
            key: "cancel",
            label: "Отменить поставку…",
            icon: <Ban className="h-4 w-4" />,
            danger: true,
            onSelect: onCancel,
          },
        ]
      : []),
  ];

  return (
    <>
      {/* On a phone PageHeader hides its title (the top bar shows the section) — the batch name is needed here. */}
      <div className="mb-1 break-words font-display text-[20px] font-extrabold uppercase leading-tight text-[var(--ink)] lg:hidden">
        {batch.title}
      </div>
      <PageHeader
        title={batch.title}
        subtitle={supplier ? `${supplier} · ${created}` : created}
        actions={
          // Phone: the main button and «⋯» stay on one line (the «⋯» used to drop under the button at 320).
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            {open ? (
              <Button variant="accent" className="min-w-0 flex-1 sm:flex-none" icon={<PackageCheck className="h-4 w-4" />} onClick={onArrive}>
                <span className="sm:hidden">Приехала, принять</span>
                <span className="max-sm:hidden">Приехала — принять товар</span>
              </Button>
            ) : (
              <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
                Изменить
              </Button>
            )}
            {open && <ActionMenu trigger="header" title={batch.title} items={actions} label="Ещё действия" busy={statusPending} />}
          </div>
        }
      />
      <StatusSteps batch={batch} />
      <BatchFacts batch={batch} />
      <BatchNotes batch={batch} />
    </>
  );
}

/** Где сейчас поставка: пройденные шаги — галочкой, текущий — акцентом. Отменённая — одной красной плашкой. */
function StatusSteps({ batch }: { batch: Batch }) {
  if (batch.status === "CANCELLED") {
    return (
      <div className="mb-3">
        <Badge tone="danger" dot>
          Отменена
          {batch.cancelledAt ? ` ${formatDateTime(batch.cancelledAt)}` : ""}
        </Badge>
        {batch.cancelReason && <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">Причина: {batch.cancelReason}</p>}
      </div>
    );
  }
  const at = STEPS.findIndex((s) => s.status === batch.status);
  return (
    <ol className="mb-3 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] sm:text-[12.5px]" aria-label="Статус поставки">
      {STEPS.map((s, i) => (
        <li key={s.status} className="flex items-center gap-1.5">
          {/* Phone: no connectors — the row wraps and a connector started the second line as a stray «—». */}
          {i > 0 && <span className={cn("h-px w-6 max-sm:hidden", i <= at ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]")} />}
          <span
            aria-current={i === at ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 font-semibold sm:px-2.5",
              i < at && "text-[var(--text-muted)]",
              i === at && "bg-[var(--accent)] text-[var(--accent-ink)]",
              i > at && "border border-[var(--line)] text-[var(--text-faint)]",
            )}
          >
            {i < at && <Check className="h-3.5 w-3.5" />}
            {/* Phone: passed steps are just a tick — four labels wrapped and left «Приехала» alone on a line. */}
            <span className={cn(i < at && "max-sm:sr-only")}>{s.label}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function BatchFacts({ batch }: { batch: Batch }) {
  const distLabel = DISTRIBUTIONS.find((d) => d.value === batch.distribution)?.label ?? batch.distribution;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--text-muted)]">
      {/* Предзаказ имеет смысл, пока поставка едет: у приехавшей и отменённой бейдж только путает. */}
      {isOpenStatus(batch.status) &&
        (batch.preorderOpen ? <Badge tone="accent">можно заказать заранее</Badge> : <Badge>заранее не заказывают</Badge>)}
      {batch.status === "ARRIVED" ? (
        batch.arrivedAt && <span>приехала {formatDateTime(batch.arrivedAt)}</span>
      ) : (
        <span>ожидаем: {etaText(batch)}</span>
      )}
      <span>
        · {distLabel}
        {batch.distribution !== "ALL_AT_ONCE" && `, бронь ${batch.holdHours} ч`}
      </span>
    </div>
  );
}

function BatchNotes({ batch }: { batch: Batch }) {
  if (!batch.privateNote && !batch.publicNote) return null;
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-2">
      {batch.privateNote && (
        <div className="card-2 p-3 text-[13px]">
          <div className="field-label mb-1">Заметка для себя</div>
          <p className="whitespace-pre-wrap break-words text-[var(--text)]">{batch.privateNote}</p>
        </div>
      )}
      {batch.publicNote && (
        <div className="card-2 p-3 text-[13px]">
          <div className="field-label mb-1">Видят покупатели</div>
          <p className="whitespace-pre-wrap break-words text-[var(--text)]">{batch.publicNote}</p>
        </div>
      )}
    </div>
  );
}
