"use client";

/** «Клиент»: ФИО, телефон, Telegram, комментарий; «Изменить» открывает правку получателя. */
import { Phone, User, ExternalLink, Pencil } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import type { AdminOrderDetail } from "../../api";
import type { DetailHandlers } from "./types";
import { Row, Section, SectionAction } from "./section";

export function CustomerSection({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  const editable = order.status === "NEW" || order.status === "APPROVED";
  const deliveryEditable = editable || order.status === "SHIPPED";

  return (
  <Section
    title="Клиент"
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
      {order.tgUsername ? (
        <a
          href={`https://t.me/${order.tgUsername.replace(/^@/, "")}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-[14px] text-[var(--accent-hi)] hover:underline pointer-coarse:py-2.5"
        >
          <ExternalLink className="h-4 w-4" />@{order.tgUsername.replace(/^@/, "")}
        </a>
      ) : order.tgUserId ? (
        <a
          href={`tg://user?id=${order.tgUserId}`}
          className="flex items-center gap-2 text-[14px] text-[var(--accent-hi)] hover:underline pointer-coarse:py-2.5"
        >
          <ExternalLink className="h-4 w-4" />
          Открыть в Telegram (без @username)
        </a>
      ) : null}
      {order.comment && (
        <p className="card-2 mt-1 whitespace-pre-wrap px-3 py-2 text-[13px] text-[var(--text-muted)]">
          💬 {order.comment}
        </p>
      )}
    </div>
  </Section>
  );
}
