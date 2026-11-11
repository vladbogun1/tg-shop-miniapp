"use client";

/**
 * «Получатель и доставка» — одна карточка: ФИО (профиль клиента), телефон tel:, Telegram, способ и адрес с копированием,
 * ТТН с копированием, комментарий покупателя. Одна кнопка «Изменить» (доставка: NEW / APPROVED / SHIPPED);
 * ТТН правится отдельно (SHIPPED / DELIVERED) — это другое окно и другие правила.
 */
import { ExternalLink, Pencil, Phone, Store, Truck, User } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import type { AdminOrderDetail } from "../../api";
import { serviceLabel } from "@/features/delivery";
import { deliveryAddress, npRecipientIfDifferent } from "../../model/address";
import { DELIVERY_LABEL } from "../../model/status";
import { Row, Section, SectionAction } from "./section";
import type { DetailHandlers } from "./types";

const TG_LINK = "flex items-center gap-2 text-[14px] text-[var(--accent-hi)] hover:underline pointer-coarse:py-2.5";

function TelegramLink({ order }: { order: AdminOrderDetail }) {
  if (order.tgUsername) {
    const name = order.tgUsername.replace(/^@/, "");
    return (
      <a href={`https://t.me/${name}`} target="_blank" rel="noreferrer" className={TG_LINK}>
        <ExternalLink className="h-4 w-4" />@{name}
      </a>
    );
  }
  if (!order.tgUserId) return null;
  return (
    <a href={`tg://user?id=${order.tgUserId}`} className={TG_LINK}>
      <ExternalLink className="h-4 w-4" />
      Открыть в Telegram (без @username)
    </a>
  );
}

function TrackingRow({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  const trackable = order.status === "SHIPPED" || order.status === "DELIVERED";
  if (!order.trackingNumber) {
    return trackable ? (
      <button
        type="button"
        onClick={h.onEditTracking}
        className="hit self-start text-[13px] font-semibold text-[var(--accent-hi)] hover:underline"
      >
        + Указать ТТН
      </button>
    ) : null;
  }
  return (
    <Row icon={<Truck className="h-4 w-4" />}>
      <span>
        ТТН: <span className="tabular font-semibold">{order.trackingNumber}</span>
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <CopyButton value={order.trackingNumber} label="Скопировать ТТН" />
        {trackable && (
          <button
            type="button"
            onClick={h.onEditTracking}
            title="Изменить ТТН"
            aria-label="Изменить ТТН"
            className="nb-press hit grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] pointer-coarse:h-9 pointer-coarse:w-9"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </Row>
  );
}

/** Способ доставки, тип НП (отделение / почтомат / курьер), адрес с копированием и получатель для ТТН, если он другой. */
function DeliveryRows({ order }: { order: AdminOrderDetail }) {
  const isNp = order.deliveryMethod === "NOVA_POSHTA";
  const address = deliveryAddress(order);
  const service = isNp ? serviceLabel(order.npServiceType) : null;
  const npRecipient = isNp ? npRecipientIfDifferent(order) : null;
  return (
    <>
      <Row icon={isNp ? <Truck className="h-4 w-4" /> : <Store className="h-4 w-4" />}>
        <span className="min-w-0">
          <b className="font-semibold">{order.deliveryMethod ? DELIVERY_LABEL[order.deliveryMethod] : undefined}</b>
          {service && <span className="text-[var(--text-muted)]"> · {service}</span>}
          {address && <span className="text-[var(--text-muted)]"> · {address}</span>}
        </span>
        {address && <CopyButton value={address} label="Скопировать адрес" className="ml-auto" />}
      </Row>
      {npRecipient && (
        <Row icon={<User className="h-4 w-4" />}>
          <span className="min-w-0 break-words">
            Получатель для НП: <b className="font-semibold">{npRecipient}</b>
          </span>
          <CopyButton value={npRecipient} label="Скопировать получателя" className="ml-auto" />
        </Row>
      )}
    </>
  );
}

export function RecipientSection({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  const deliveryEditable = order.status === "NEW" || order.status === "APPROVED" || order.status === "SHIPPED";

  return (
    <Section
      title="Получатель и доставка"
      action={
        deliveryEditable ? (
          <SectionAction icon={<Pencil className="h-3.5 w-3.5" />} onClick={h.onEditDelivery}>
            Изменить
          </SectionAction>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2">
        <Row icon={<User className="h-4 w-4" />}>
          {h.onOpenCustomer ? (
            <button
              type="button"
              onClick={h.onOpenCustomer}
              className="min-w-0 truncate text-left font-semibold text-[var(--accent-hi)] hover:underline pointer-coarse:py-2.5"
              title="Профиль клиента и другие его заказы"
            >
              {order.customerName}
            </button>
          ) : (
            <span className="min-w-0 truncate">{order.customerName}</span>
          )}
          <CopyButton value={order.customerName} label="Скопировать ФИО" className="ml-auto" />
        </Row>
        <Row icon={<Phone className="h-4 w-4" />}>
          <a href={`tel:${order.phone}`} className="hit tabular font-semibold text-[var(--text)] hover:underline">
            {order.phone}
          </a>
          <CopyButton value={order.phone} label="Скопировать телефон" className="ml-auto" />
        </Row>
        <TelegramLink order={order} />
        <DeliveryRows order={order} />
        {/* ТТН, созданная здесь, показывается и правится в блоке «Нова пошта · ТТН». */}
        {order.shipment?.origin !== "API" && <TrackingRow order={order} h={h} />}
        {order.comment && (
          <p className="card-2 mt-1 whitespace-pre-wrap px-3 py-2 text-[13px] text-[var(--text-muted)]">💬 {order.comment}</p>
        )}
      </div>
    </Section>
  );
}
