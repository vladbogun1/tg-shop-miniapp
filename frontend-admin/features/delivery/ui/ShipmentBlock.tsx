"use client";

/**
 * «Нова пошта · ТТН» в карточке заказа.
 *  - ТТН нет: «Пакуй в» + «Упаковано — создать ТТН» (одобренный заказ НП); главному админу ещё «Создать ТТН
 *    вручную» (окно с живым предпросмотром) для NEW / APPROVED.
 *  - ТТН есть: номер (копировать), стадия, текст НП, ссылка на отслеживание, когда опрашивали (или почему
 *    не вышло), «Оновити статус», «Печать этикетки», а пока НП не сканировала посылку и ТТН наша —
 *    «Изменить ТТН» / «Отменить ТТН».
 * ТТН не отправляет заказ: он остаётся «Одобрен», пока НП не примет посылку (тогда опрос переводит в «Отправлен»).
 * «ТТН устарела» — см. use-stale.ts: плашка, разовое окно и «Пересоздать ТТН».
 *
 * Фича delivery не знает тип заказа: блок берёт узкую форму и сообщает об изменениях через `onChanged`
 * (как OnlinePaymentBlock).
 */
import { useState } from "react";
import { useIsSuperAdmin } from "@/features/staff";
import { ExternalLink, Pencil, RefreshCw, RotateCcw, Trash2, Truck } from "lucide-react";
import { useConfirm } from "@shop/ui/confirm";
import { Button } from "@shop/ui/admin-button";
import { formatDateTime, timeAgo } from "@shop/core/time";
import { Badge } from "@/components/ui/Badge";
import { CopyButton } from "@/components/ui/CopyButton";
import { serviceLabel, shipmentEditable } from "../model/labels";
import type { ShipmentMode } from "../model/shipment-form";
import type { Packing, Shipment } from "../model/types";
import { useCancelShipment, useRefreshShipment } from "../queries";
import { LabelPrint } from "./LabelPrint";
import { ShipmentFacts } from "./ShipmentFacts";
import { UNCONFIRMED_PRINT } from "../model/packing";
import { PackBox } from "./packing/PackBox";
import { ShipmentPacking } from "./packing/ShipmentPacking";
import { ShipmentStageBadge } from "./parts";
import { StaleBanner, StaleDialog } from "./StaleShipment";
import { useStaleShipment, type StaleState } from "./use-stale";
import { ShipmentDialog } from "./ShipmentDialog";

/** Что блоку нужно от заказа. */
export interface ShipmentOrder {
  id: string;
  status: string;
  currency?: string | null;
  deliveryMethod?: string | null;
  npServiceType?: string | null;
  shipment?: Shipment | null;
  /** Одобренный заказ НП без ТТН: во что паковать («Упаковано» создаст ТТН). */
  toPack?: Packing | null;
}

function StatusHint({ s, st, open }: { s: Shipment; st: StaleState; open: boolean }) {
  if (st.settling) {
    return (
      <p className="text-[12.5px] leading-snug text-[var(--warn)]" aria-live="polite">
        Заказ изменился — обновляем ТТН в Новой Почте…
      </p>
    );
  }
  if (s.stage !== "CREATED" || !open) return null;
  return (
    <p className="text-[12.5px] leading-snug text-[var(--text-muted)]">
      ТТН создана, посылку ещё не приняли. Заказ перейдёт в «Отправлен», когда Новая Почта заберёт её.
    </p>
  );
}

function PollLine({ s }: { s: Shipment }) {
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-faint)]">
        {s.trackingUrl && (
          <a
            href={s.trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="hit inline-flex items-center gap-1 font-semibold text-[var(--accent-hi)] hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Отследить на сайте НП
          </a>
        )}
        <span>{s.lastPolledAt ? `Опрошена ${timeAgo(s.lastPolledAt)} · ${formatDateTime(s.lastPolledAt)}` : "Ещё не опрашивалась"}</span>
      </div>
      {s.pollError && (
        <p className="break-words rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12.5px] text-[var(--danger-ink)]">
          Новая Почта не ответила: {s.pollError}
        </p>
      )}
    </>
  );
}

function ShipmentActions({
  order,
  s,
  editable,
  st,
  onEdit,
  onRemake,
  onChanged,
}: {
  order: ShipmentOrder;
  s: Shipment;
  editable: boolean;
  st: StaleState;
  onEdit: () => void;
  /** Удалить в НП и создать заново (напечатанную — с новым номером). */
  onRemake: () => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const cancel = useCancelShipment(order.id, onChanged);
  const printable = s.origin === "API" && s.stage !== "CANCELLED";
  async function askCancel() {
    const ok = await confirm({
      title: "Отменить ТТН?",
      message: `ТТН ${s.ttn} будет удалена в Новой Почте. Заказ останется, и можно создать новую ТТН.`,
      confirmLabel: "Отменить ТТН",
      danger: true,
    });
    if (ok) cancel.mutate(s.ttn);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {editable && (
        <Button size="sm" variant="surface" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
          Изменить ТТН
        </Button>
      )}
      {printable && (
        <LabelPrint
          orderIds={[order.id]}
          disabled={st.stale || st.settling}
          disabledTitle={st.stale ? "ТТН устарела — сначала перестворите её" : "Обновляем ТТН…"}
          confirmFirst={s.packing?.unconfirmed ? UNCONFIRMED_PRINT : undefined}
        />
      )}
      {editable && (
        <Button size="sm" variant="surface" icon={<RotateCcw className="h-4 w-4" />} onClick={onRemake}>
          Пересоздать ТТН
        </Button>
      )}
      {editable && (
        <Button size="sm" variant="danger" loading={cancel.isPending} icon={<Trash2 className="h-4 w-4" />} onClick={askCancel}>
          Отменить ТТН
        </Button>
      )}
    </div>
  );
}

function ShipmentView({
  order,
  s,
  modalOpen,
  onModal,
  onChanged,
}: {
  order: ShipmentOrder;
  s: Shipment;
  modalOpen: boolean;
  onModal: (m: ShipmentMode) => void;
  onChanged: () => void;
}) {
  const [seen, setSeen] = useState("");
  const open = order.status === "NEW" || order.status === "APPROVED";
  const editable = shipmentEditable(s) && open;
  const st = useStaleShipment(s, editable, onChanged);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="tabular text-[16px] font-bold text-[var(--ink)]">{s.ttn}</span>
        <CopyButton value={s.ttn} label="Скопировать ТТН" />
        <ShipmentStageBadge stage={s.stage} />
        {s.origin === "MANUAL" && <Badge tone="neutral">введена вручную</Badge>}
        {s.serviceType && <span className="text-[12px] text-[var(--text-faint)]">{serviceLabel(s.serviceType)}</span>}
      </div>
      {st.stale ? <StaleBanner reasons={st.reasons} printed={!!s.printedAt} onRemake={() => onModal("remake")} /> : <StatusHint s={s} st={st} open={open} />}
      {s.statusText && <p className="break-words text-[13px] leading-snug text-[var(--text)]">{s.statusText}</p>}
      <ShipmentFacts s={s} currency={order.currency ?? "UAH"} />
      <ShipmentPacking orderId={order.id} s={s} open={open} onChanged={onChanged} />
      <PollLine s={s} />
      <ShipmentActions order={order} s={s} editable={editable} st={st} onEdit={() => onModal("edit")} onRemake={() => onModal("remake")} onChanged={onChanged} />
      <StaleDialog
        open={st.stale && seen !== st.key && !modalOpen}
        ttn={s.ttn}
        reasons={st.reasons}
        printed={!!s.printedAt}
        onLater={() => setSeen(st.key)}
        onRemake={() => {
          setSeen(st.key);
          onModal("remake");
        }}
      />
    </div>
  );
}

export function ShipmentBlock({ order, onChanged }: { order: ShipmentOrder; onChanged: () => void }) {
  const [modal, setModal] = useState<ShipmentMode | null>(null);
  const s = order.shipment ?? null;
  const refresh = useRefreshShipment(order.id, onChanged);
  const isSuper = useIsSuperAdmin() === true;
  if (order.deliveryMethod !== "NOVA_POSHTA") return null;
  const canCreate = !s && (order.status === "NEW" || order.status === "APPROVED");
  const service = serviceLabel(order.npServiceType);

  return (
    <section className="card p-4" aria-label="Нова пошта">
      <div className="mb-3 flex min-h-7 flex-wrap items-center justify-between gap-2">
        <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">Нова пошта · ТТН</h3>
        {s && (
          <Button size="sm" variant="ghost" loading={refresh.isPending} icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => refresh.mutate()}>
            Оновити статус
          </Button>
        )}
      </div>
      {s ? (
        <ShipmentView order={order} s={s} modalOpen={modal !== null} onModal={setModal} onChanged={onChanged} />
      ) : (
        <div className="flex flex-col items-stretch gap-2.5">
          <p className="text-[13px] leading-snug text-[var(--text-muted)]">
            {service ? `${service} · ` : ""}
            {order.toPack ? "ТТН ещё нет: она создастся после «Упаковано» — под выбранную коробку." : "ТТН ещё нет."}
          </p>
          {order.toPack && <PackBox orderId={order.id} packing={order.toPack} ttn={null} onDone={onChanged} postomat={order.npServiceType === "POSTOMAT"} />}
          {canCreate && isSuper && (
            <Button size="sm" variant="ghost" className="self-start" icon={<Truck className="h-4 w-4" />} onClick={() => setModal("create")}>
              Создать ТТН вручную
            </Button>
          )}
        </div>
      )}
      {modal && (
        <ShipmentDialog
          orderId={order.id}
          mode={modal}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
