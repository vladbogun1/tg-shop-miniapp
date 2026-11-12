"use client";

import { Badge } from "@/components/ui/Badge";
import { courierStreet, type AdminDispatchOrder } from "@/features/order";
import { PaymentBadge } from "@/features/payment";
import { cn } from "@/lib/cn";
import { money } from "@shop/core/money";
import { ChevronDown, ChevronRight, Hash, MapPin, Phone, Store, Truck, User } from "lucide-react";
import { useState } from "react";
import { approvedUnpaid, awaitingPrepayment, dueExpired } from "../model/dispatch";
import { isStale } from "../model/batch";
import { CodCallout } from "./CodCallout";
import { CopyField } from "./CopyField";
import { OrderItems } from "./OrderItems";
import { AwaitingPaymentNote, UnpaidNote } from "./PaymentWarnings";
import { ShipForm } from "./ShipForm";
import { NpBadges, TickBox } from "./NpCardParts";
import { ShipmentRow } from "./ShipmentRow";
import { PackBox, type LabelFormat, type ShipmentMode } from "@/features/delivery";

/** `#id · name · payment badge` — the first thing to match against the parcel. The whole left part opens the order. */
function CardHeader({ o, onOpen }: { o: AdminDispatchOrder; onOpen: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onOpen}
        className="focusable group flex min-w-0 flex-1 items-center gap-2 rounded-[var(--r-sm)] text-left pointer-coarse:min-h-11"
        title="Открыть заказ"
      >
        <span className="font-display tabular inline-flex h-7 shrink-0 items-center gap-0.5 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] pl-1 pr-2 text-[14px] font-bold tracking-[0.02em] text-[var(--ink)]">
          <Hash className="h-3.5 w-3.5 text-[var(--text-faint)]" />
          {o.shortId}
        </span>
        {o.status === "NEW" && <Badge tone="info">Новый</Badge>}
        <span className="min-w-0 truncate text-[15px] font-semibold text-[var(--text)] group-hover:underline">{o.customerName}</span>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
        <span className="sr-only">открыть заказ</span>
      </button>
      <PaymentBadge order={o} icon={false} />
    </div>
  );
}

/** Recipient + address, 2×2: one field per field of the Nova Poshta form; the phone also has a call link. */
function Recipient({ o }: { o: AdminDispatchOrder }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <CopyField icon={<User className="h-4 w-4" />} label="Получатель" value={o.customerName} />
      <CopyField
        icon={<Phone className="h-4 w-4" />}
        label="Телефон"
        value={o.phone}
        mono
        extra={
          <a
            href={`tel:${o.phone}`}
            aria-label={`Позвонить: ${o.phone}`}
            title="Позвонить"
            className="nb-press focusable grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <Phone className="h-4 w-4" />
          </a>
        }
      />
      {o.deliveryMethod === "PICKUP" ? (
        <CopyField icon={<MapPin className="h-4 w-4" />} label="Доставка" value="Самовывоз" noCopy />
      ) : (
        <>
          <CopyField icon={<Truck className="h-4 w-4" />} label="Город" value={o.npCityName ?? "—"} />
          {o.npServiceType === "DOORS" ? (
            <CopyField icon={<MapPin className="h-4 w-4" />} label="Адрес" value={courierStreet(o) || "—"} wrap />
          ) : (
            <CopyField icon={<MapPin className="h-4 w-4" />} label="Отделение" value={o.npWarehouseName ?? "—"} wrap />
          )}
        </>
      )}
    </div>
  );
}

function MoneyRow({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-display text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</span>
      <span className={cn("tabular text-right font-semibold", tone === "ok" ? "text-[var(--ok)]" : "text-[var(--text)]")}>{value}</span>
    </div>
  );
}

/** Order sum / payment option / received — folded: the COD number above already says what to collect. */
function PaymentDetails({ o }: { o: AdminDispatchOrder }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-[var(--line)] pt-2 text-[13px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focusable flex min-h-8 w-full items-center justify-between gap-2 rounded-[var(--r-sm)] text-left text-[var(--text-muted)] pointer-coarse:min-h-11"
      >
        <span className="font-display text-[11.5px] font-semibold uppercase tracking-[0.08em]">Детали оплаты</span>
        <span className="tabular flex items-center gap-1 text-[12px]">
          {!open && <>Сумма {money(o.totalMinor, o.currency)}</>}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-1 pb-1">
          <MoneyRow label="Сумма заказа" value={money(o.totalMinor, o.currency)} />
          {o.paymentOptionTitle && <MoneyRow label="Оплата" value={o.paymentOptionTitle} />}
          {o.receivedMinor > 0 && <MoneyRow label="Получено" value={money(o.receivedMinor, o.currency)} tone="ok" />}
        </div>
      )}
    </div>
  );
}

/**
 * Order of the card (top to bottom): who → how much to collect (+ a red/amber warning) → recipient →
 * items → payment details (folded) → TTN + «Отправлено». A red (unpaid) / amber (waiting) stripe on the left.
 */
/** Новая Почта на карточке: галочка пакета, формат этикеток экрана и окно ТТН. */
export interface CardNp {
  ticked: boolean;
  onTick: () => void;
  format: LabelFormat;
  onTtn: (mode: ShipmentMode) => void;
  /** Коробка подтверждена: перечитать «Отправку». */
  onPacked: () => void;
}

/** «Пакуй в» — у живой, не устаревшей ТТН. */
function Packing({ o, onPacked }: { o: AdminDispatchOrder; onPacked: () => void }) {
  if (!o.shipmentPacking || !o.shipmentStage || o.shipmentStage === "CANCELLED" || isStale(o)) return null;
  return <PackBox orderId={o.id} packing={o.shipmentPacking} ttn={o.trackingNumber} onDone={onPacked} />;
}

export function DispatchCard({ o, np, onOpen, onZoom }: { o: AdminDispatchOrder; np: CardNp; onOpen: () => void; onZoom: (src: string) => void }) {
  const isNp = o.deliveryMethod === "NOVA_POSHTA";
  const unpaid = approvedUnpaid(o);
  const waiting = awaitingPrepayment(o);
  return (
    <div
      className={cn(
        "panel flex flex-col gap-3 p-3 sm:p-4",
        unpaid && "shadow-[inset_3px_0_0_var(--danger)]",
        waiting && "shadow-[inset_3px_0_0_var(--warn)]"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {isNp && <TickBox o={o} ticked={np.ticked} onTick={np.onTick} />}
        <div className="min-w-0 flex-1">
          <CardHeader o={o} onOpen={onOpen} />
        </div>
      </div>
      {isNp && <NpBadges o={o} />}
      {waiting && <AwaitingPaymentNote o={o} />}
      {unpaid && <UnpaidNote o={o} expired={dueExpired(o, unpaid)} />}
      {o.deliveryMethod === "PICKUP" ? (
        <div className="chip-tint !h-7 !w-fit !px-3 !text-[11.5px]">
          <Store className="h-3.5 w-3.5" />
          Самовывоз
        </div>
      ) : (
        <CodCallout o={o} />
      )}
      <Recipient o={o} />
      <OrderItems items={o.items} onZoom={onZoom} />
      <PaymentDetails o={o} />
      {isNp && <Packing o={o} onPacked={np.onPacked} />}
      {isNp && <ShipmentRow o={o} format={np.format} onTtn={np.onTtn} />}
      <ShipForm o={o} />
    </div>
  );
}
