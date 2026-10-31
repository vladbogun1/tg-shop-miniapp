"use client";

import { Badge } from "@/components/ui/Badge";
import type { AdminDispatchOrder } from "@/features/order";
import { PaymentBadge } from "@/features/payment";
import { cn } from "@/lib/cn";
import { money } from "@shop/core/money";
import { Hash, MapPin, Phone, Truck, User } from "lucide-react";
import { approvedUnpaid, awaitingPrepayment, dueExpired } from "../model/dispatch";
import { CodCallout } from "./CodCallout";
import { CopyField } from "./CopyField";
import { OrderItems } from "./OrderItems";
import { AwaitingPaymentNote, UnpaidNote } from "./PaymentWarnings";
import { ShipForm } from "./ShipForm";

function CardHeader({ o, onOpen }: { o: AdminDispatchOrder; onOpen: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--line)] pb-3.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-left pointer-coarse:min-h-11"
        title="Открыть заказ"
      >
        <span className="font-display tabular inline-flex h-7 items-center gap-1 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] pl-1.5 pr-2.5 text-[14px] font-bold tracking-[0.02em] text-[var(--ink)]">
          <Hash className="h-3.5 w-3.5 text-[var(--text-faint)]" />
          {o.shortId}
        </span>
        {o.status === "NEW" && <Badge tone="info">Новый</Badge>}
        <span className="text-[13px] font-semibold text-[var(--accent-hi)] underline-offset-2 hover:underline pointer-coarse:py-2">открыть заказ →</span>
      </button>
      <PaymentBadge order={o} icon={false} />
    </div>
  );
}

/** Recipient + address: one copy button per field of the Nova Poshta form. */
function Recipient({ o }: { o: AdminDispatchOrder }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <CopyField icon={<User className="h-4 w-4" />} label="Получатель" value={o.customerName} />
      <CopyField icon={<Phone className="h-4 w-4" />} label="Телефон" value={o.phone} href={`tel:${o.phone}`} mono />
      {o.deliveryMethod === "PICKUP" ? (
        <CopyField icon={<MapPin className="h-4 w-4" />} label="Доставка" value="Самовывоз" noCopy />
      ) : (
        <>
          <CopyField icon={<Truck className="h-4 w-4" />} label="Город" value={o.npCityName ?? "—"} />
          <CopyField icon={<MapPin className="h-4 w-4" />} label="Отделение" value={o.npWarehouseName ?? "—"} wrap />
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

function MoneyBlock({ o }: { o: AdminDispatchOrder }) {
  return (
    <div className="flex flex-col gap-1 border-t border-[var(--line)] pt-3.5 text-[13px]">
      <MoneyRow label="Сумма заказа" value={money(o.totalMinor, o.currency)} />
      {o.paymentOptionTitle && <MoneyRow label="Оплата" value={o.paymentOptionTitle} />}
      {o.receivedMinor > 0 && <MoneyRow label="Получено" value={money(o.receivedMinor, o.currency)} tone="ok" />}
    </div>
  );
}

export function DispatchCard({ o, onOpen, onZoom }: { o: AdminDispatchOrder; onOpen: () => void; onZoom: (src: string) => void }) {
  const unpaid = approvedUnpaid(o);
  return (
    <div className="panel flex flex-col gap-4 p-4 sm:p-5">
      <CardHeader o={o} onOpen={onOpen} />
      {awaitingPrepayment(o) && <AwaitingPaymentNote o={o} />}
      {unpaid && <UnpaidNote o={o} expired={dueExpired(o, unpaid)} />}
      <Recipient o={o} />
      <OrderItems items={o.items} onZoom={onZoom} />
      <MoneyBlock o={o} />
      {/* THE KEY LINE — big COD callout */}
      {o.deliveryMethod !== "PICKUP" && <CodCallout o={o} />}
      <ShipForm o={o} />
    </div>
  );
}
