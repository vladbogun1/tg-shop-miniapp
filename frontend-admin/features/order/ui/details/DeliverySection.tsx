"use client";

/** «Доставка и оплата»: способ, адрес, получено / наложка / возвращено, ТТН — всё для отправки, сразу под клиентом. */
import { Truck, Store, CreditCard, Wallet, Pencil } from "lucide-react";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { CopyButton } from "@/components/ui/CopyButton";
import type { AdminOrderDetail } from "../../api";
import { codMinor, DELIVERY_LABEL } from "../../model/status";
import type { DetailHandlers } from "./types";
import { Row, Section } from "./section";

export function DeliverySection({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  const isNp = order.deliveryMethod === "NOVA_POSHTA";
  const address = [order.npCityName, order.npWarehouseName].filter(Boolean).join(", ");
  const cod = codMinor(order);
  const refunded = order.refundedMinor ?? 0;

  return (
  <Section title="Доставка и оплата">
    <div className="flex flex-col gap-2">
      <Row icon={isNp ? <Truck className="h-4 w-4" /> : <Store className="h-4 w-4" />}>
        <span className="min-w-0">
          <b className="font-semibold">{order.deliveryMethod ? DELIVERY_LABEL[order.deliveryMethod] : undefined}</b>
          {address && <span className="text-[var(--text-muted)]"> · {address}</span>}
        </span>
        {address && <CopyButton value={address} label="Скопировать адрес" className="ml-auto" />}
      </Row>
      {order.paymentOptionTitle && (
        <Row icon={<CreditCard className="h-4 w-4" />}>
          <span className="min-w-0">{order.paymentOptionTitle}</span>
        </Row>
      )}
      <Row icon={<Wallet className="h-4 w-4" />}>
        <span className="min-w-0">
          Получено <b className="font-semibold">{money(order.receivedMinor, order.currency)}</b>
          {isNp && (
            <>
              {" · "}Наложка{" "}
              <b className={cn("font-semibold", cod > 0 ? "text-[var(--danger-ink)]" : "text-[var(--ok)]")}>
                {money(cod, order.currency)}
              </b>
            </>
          )}
          {refunded > 0 && (
            <>
              {" · "}Возвращено <b className="font-semibold">{money(refunded, order.currency)}</b>
            </>
          )}
        </span>
      </Row>
      {order.trackingNumber ? (
        <Row icon={<Truck className="h-4 w-4" />}>
          <span>
            ТТН: <span className="tabular font-semibold">{order.trackingNumber}</span>
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <CopyButton value={order.trackingNumber} label="Скопировать ТТН" />
            {(order.status === "SHIPPED" || order.status === "DELIVERED") && (
              <button
                type="button"
                onClick={h.onEditTracking}
                title="Изменить ТТН"
                aria-label="Изменить ТТН"
                className="nb-press hit grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </Row>
      ) : (
        (order.status === "SHIPPED" || order.status === "DELIVERED") && (
          <button
            type="button"
            onClick={h.onEditTracking}
            className="self-start text-[13px] font-semibold text-[var(--accent-hi)] hover:underline"
          >
            + Указать ТТН
          </button>
        )
      )}
    </div>
  </Section>
  );
}
