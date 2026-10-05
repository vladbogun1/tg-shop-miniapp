"use client";

/**
 * "Детали" tab of the order card: customer, delivery + money, online payment (monobank), items, timeline.
 * Everything the admin types into the Nova Poshta form has a copy button; the phone is a `tel:` link.
 */
import type { Ref } from "react";
import {
  Phone,
  User,
  Truck,
  Store,
  CreditCard,
  Ban,
  Trash2,
  ExternalLink,
  Plus,
  Percent,
  Pencil,
  Undo2,
  Wallet,
} from "lucide-react";
import type { OrderStatus } from "@/lib/api";
import type { AdminOrderDetail } from "@/lib/orders-api";
import { money } from "@/lib/money";
import {
  codMinor,
  DELIVERY_LABEL,
  formatDateTime,
  REJECT_REASON_LABEL,
  STATUS_LABEL,
  STATUS_VAR,
} from "@/lib/orders";
import { Image } from "@/lib/image";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { CopyButton } from "./CopyButton";
import { OnlinePaymentBlock } from "./OnlinePaymentBlock";

export interface DetailHandlers {
  busyKey: string | null;
  onChangeQty: (id: number, qty: number) => void;
  onRemoveItem: (id: number, title: string) => void;
  onAddItem: () => void;
  onDiscount: () => void;
  onEditDelivery: () => void;
  onEditTracking: () => void;
  onOpenCustomer?: () => void;
  onReturn?: () => void;
  /** Invoices refreshed or refunded — reload the order and the lists. */
  onPaymentChanged?: () => void;
  /** The «Онлайн-оплата» section, to scroll to it («Внимание» → «Оплаты»). */
  paymentRef?: Ref<HTMLElement>;
}

export function OrderDetails({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  const editable = order.status === "NEW" || order.status === "APPROVED";
  const deliveryEditable = editable || order.status === "SHIPPED";
  const isNp = order.deliveryMethod === "NOVA_POSHTA";
  const address = [order.npCityName, order.npWarehouseName].filter(Boolean).join(", ");
  const cod = codMinor(order);
  const refunded = order.refundedMinor ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Customer */}
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

      {/* Delivery + money — what is needed to ship, right under the customer */}
      <Section title="Доставка и оплата">
        <div className="flex flex-col gap-2">
          <Row icon={isNp ? <Truck className="h-4 w-4" /> : <Store className="h-4 w-4" />}>
            <span className="min-w-0">
              <b className="font-semibold">{DELIVERY_LABEL[order.deliveryMethod]}</b>
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

      <OnlinePaymentBlock ref={h.paymentRef} order={order} onChanged={h.onPaymentChanged} />

      {/* Items */}
      <Section title="Состав">
        <div className="flex flex-col gap-3">
          {order.items.map((it, i) => (
            <div key={it.id ?? i} className="flex items-start gap-3">
              <Image
                src={it.imageUrl ?? undefined}
                alt={it.title}
                size={96}
                className="h-12 w-12 shrink-0 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {it.gift && (
                    <span className="chip-tint shrink-0 !px-2 !text-[10px]" style={{ "--chip": "var(--accent-hi)" } as React.CSSProperties}>
                      🎁 Подарок
                    </span>
                  )}
                  <span className="truncate text-[14px] text-[var(--text)]">{it.title}</span>
                </div>
                {it.variantName && <div className="text-[12px] text-[var(--text-faint)]">{it.variantName}</div>}
                {(it.returnedQty ?? 0) > 0 && (
                  <div className="text-[12px] font-semibold text-[var(--warn)]">↩ возвращено {it.returnedQty} шт.</div>
                )}
                {editable && it.id != null ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <QtyBtn
                      onClick={() => h.onChangeQty(it.id!, it.quantity - 1)}
                      disabled={!!h.busyKey || it.quantity <= 1}
                    >
                      −
                    </QtyBtn>
                    <span className="tabular w-7 text-center text-[13px] font-semibold text-[var(--text)]">{it.quantity}</span>
                    <QtyBtn onClick={() => h.onChangeQty(it.id!, it.quantity + 1)} disabled={!!h.busyKey}>
                      +
                    </QtyBtn>
                    <button
                      type="button"
                      onClick={() => h.onRemoveItem(it.id!, it.title)}
                      disabled={!!h.busyKey}
                      className="nb-press hit ml-1 grid h-7 w-7 place-items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)] disabled:opacity-40"
                      aria-label="Убрать позицию"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-0.5 text-[12px] text-[var(--text-faint)]">×{it.quantity}</div>
                )}
              </div>
              <div className="shrink-0 text-right text-[13px]">
                <div className="tabular font-semibold text-[var(--text)]">
                  {it.gift ? "0 ₴" : money(it.priceMinor * it.quantity, order.currency)}
                </div>
                {!it.gift && it.quantity > 1 && (
                  <div className="text-[11px] text-[var(--text-faint)]">{money(it.priceMinor, order.currency)}/шт</div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="tabular mt-4 space-y-1 border-t border-[var(--line)] pt-3 text-[13px]">
          <div className="flex justify-between text-[var(--text-muted)]">
            <span>Сумма</span>
            <span>{money(order.subtotalMinor, order.currency)}</span>
          </div>
          {order.discountMinor > 0 && (
            <div className="flex justify-between font-semibold text-[var(--ok)]">
              <span>Скидка{order.promoCode ? ` (${order.promoCode})` : ""}</span>
              <span>−{money(order.discountMinor, order.currency)}</span>
            </div>
          )}
          <div className="font-display flex items-baseline justify-between pt-0.5 text-[16px] font-bold text-[var(--ink)]">
            <span className="text-[13px] uppercase tracking-[0.06em]">Итого</span>
            <span>{money(order.totalMinor, order.currency)}</span>
          </div>
        </div>
        {(editable || h.onReturn) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {editable && (
              <>
                <Button size="sm" variant="surface" icon={<Plus className="h-4 w-4" />} onClick={h.onAddItem}>
                  Добавить товар
                </Button>
                <Button size="sm" variant="surface" icon={<Percent className="h-4 w-4" />} onClick={h.onDiscount}>
                  {order.discountMinor > 0 ? "Изменить скидку" : "Скидка"}
                </Button>
              </>
            )}
            {h.onReturn && (
              <Button size="sm" variant="surface" icon={<Undo2 className="h-4 w-4" />} onClick={h.onReturn}>
                Возврат
              </Button>
            )}
          </div>
        )}
      </Section>

      {/* Timeline */}
      <Section title="Таймлайн">
        {order.status === "REJECTED" && (order.rejectReasonCode || order.rejectReason) && (
          <div className="mb-3 flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5">
            <Ban className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger-ink)]" />
            <p className="text-[13px] font-medium text-[var(--danger-ink)]">
              <span className="font-display font-semibold uppercase tracking-[0.06em] opacity-80">Причина:</span>{" "}
              {order.rejectReasonCode ? REJECT_REASON_LABEL[order.rejectReasonCode] : null}
              {order.rejectReasonCode && order.rejectReason ? " — " : null}
              {order.rejectReason}
            </p>
          </div>
        )}
        <Timeline order={order} />
        {order.returnedAt && (
          <p className="mt-3 text-[12px] font-semibold text-[var(--text-muted)]">
            ↩ Возврат оформлен {formatDateTime(order.returnedAt)}
          </p>
        )}
      </Section>
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[14px] text-[var(--text)]">
      <span className="shrink-0 text-[var(--text-muted)]">{icon}</span>
      {children}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex min-h-7 items-center justify-between gap-2">
        <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function SectionAction({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hit flex items-center gap-1 text-[12.5px] font-semibold text-[var(--accent-hi)] hover:underline"
    >
      {icon}
      {children}
    </button>
  );
}

function QtyBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="nb-press hit grid h-7 w-7 place-items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] text-[16px] font-semibold leading-none text-[var(--text)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Timeline({ order }: { order: AdminOrderDetail }) {
  // Linear progress NEW -> APPROVED -> SHIPPED -> DELIVERED; REJECTED branches.
  const linear: OrderStatus[] = ["NEW", "APPROVED", "SHIPPED", "DELIVERED"];
  const rejected = order.status === "REJECTED";
  const reachedIdx = rejected ? 0 : linear.indexOf(order.status);

  const tsFor = (s: OrderStatus): string | null | undefined => {
    switch (s) {
      case "NEW":
        return order.createdAt;
      case "APPROVED":
        return order.approvedAt;
      case "SHIPPED":
        return order.shippedAt;
      case "DELIVERED":
        return order.deliveredAt;
      case "REJECTED":
        return order.rejectedAt;
    }
  };

  return (
    <ol className="flex flex-col gap-3">
      {linear.map((s, i) => {
        const done = i <= reachedIdx;
        const ts = tsFor(s);
        return (
          <li key={s} className="flex items-center gap-3">
            <span
              className="font-display grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold"
              style={{
                background: done ? `color-mix(in srgb, ${STATUS_VAR[s]} 16%, transparent)` : "var(--surface-2)",
                borderColor: done ? `color-mix(in srgb, ${STATUS_VAR[s]} 45%, transparent)` : "var(--line)",
                color: done ? STATUS_VAR[s] : "var(--text-faint)",
              }}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={
                done ? "text-[14px] font-semibold text-[var(--text)]" : "text-[14px] text-[var(--text-faint)]"
              }
            >
              {STATUS_LABEL[s]}
            </span>
            {ts && <span className="tabular ml-auto text-[11px] text-[var(--text-faint)]">{formatDateTime(ts)}</span>}
          </li>
        );
      })}
      {rejected && (
        <li className="flex items-center gap-3">
          <span className="font-display grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] text-[11px] font-bold text-[var(--danger-ink)]">
            ✕
          </span>
          <span className="text-[14px] font-semibold text-[var(--danger-ink)]">{STATUS_LABEL.REJECTED}</span>
          {order.rejectedAt && (
            <span className="ml-auto text-[11px] text-[var(--text-faint)]">{formatDateTime(order.rejectedAt)}</span>
          )}
        </li>
      )}
    </ol>
  );
}
