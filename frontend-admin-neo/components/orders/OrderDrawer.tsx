"use client";

/**
 * OrderDrawer — order detail in the neo `Drawer` shell.
 * Header: short id + status badge. Tabs: Детали / Чат (initialTab opens chat
 * from notifications). Details = customer + items + delivery/payment + timeline.
 * Footer: status-change actions + hard-delete for terminal orders.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Phone,
  User,
  Truck,
  Store,
  CreditCard,
  MessageSquare,
  FileText,
  Check,
  Send,
  PackageCheck,
  Ban,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  adminApi,
  ApiError,
  type OrderDetailDto,
  type OrderStatus,
} from "@/lib/api";
import { money } from "@/lib/money";
import {
  STATUS_VAR,
  STATUS_LABEL,
  DELIVERY_LABEL,
  allowedTargets,
  shortId,
  formatDateTime,
} from "@/lib/orders";
import { Image } from "@/lib/image";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { OrderChat } from "./OrderChat";
import { StatusChangeModal, type StatusChangePayload } from "./StatusChangeModal";

interface Props {
  orderId: string | null;
  onClose: () => void;
  initialTab?: "details" | "chat";
}

const ACTION_META: Record<
  OrderStatus,
  { label: string; icon: typeof Check; variant: "accent" | "surface" | "danger" }
> = {
  NEW: { label: "В новые", icon: Check, variant: "surface" },
  APPROVED: { label: "Одобрить", icon: Check, variant: "accent" },
  SHIPPED: { label: "Выслать (+ТТН)", icon: Send, variant: "accent" },
  DELIVERED: { label: "Доставлено", icon: PackageCheck, variant: "accent" },
  REJECTED: { label: "Отклонить", icon: Ban, variant: "danger" },
};

export function OrderDrawer({ orderId, onClose, initialTab = "details" }: Props) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [tab, setTab] = useState<"details" | "chat">(initialTab);
  const [pendingTarget, setPendingTarget] = useState<OrderStatus | null>(null);
  const [changing, setChanging] = useState(false);

  // Re-sync the active tab when the drawer is (re)opened for a new order.
  useEffect(() => {
    if (orderId) setTab(initialTab);
  }, [orderId, initialTab]);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => adminApi.order(orderId as string),
    enabled: !!orderId,
  });

  async function applyStatus(payload: StatusChangePayload) {
    if (!orderId) return;
    setChanging(true);
    try {
      await adminApi.changeStatus(orderId, payload);
      push(`Статус: ${STATUS_LABEL[payload.status]}`, "ok");
      setPendingTarget(null);
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["orders-table"] });
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка смены статуса", "error");
    } finally {
      setChanging(false);
    }
  }

  function requestStatus(target: OrderStatus) {
    // SHIPPED/REJECTED need a modal; others apply immediately.
    if (target === "SHIPPED" || target === "REJECTED") setPendingTarget(target);
    else applyStatus({ status: target });
  }

  // Hard-delete is allowed ONLY at a terminal stage (delivered / rejected) — for
  // purging test orders so they don't skew metrics. Irreversible.
  const isTerminal =
    !!order && (order.status === "DELIVERED" || order.status === "REJECTED");

  async function applyDelete() {
    if (!orderId) return;
    if (
      !window.confirm(
        "Удалить заказ НАВСЕГДА?\n\nВсе данные о заказе (позиции, чат) будут стёрты и он исчезнет из метрик. Действие необратимо."
      )
    )
      return;
    setChanging(true);
    try {
      await adminApi.deleteOrder(orderId);
      push("Заказ удалён навсегда", "ok");
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["orders-table"] });
      qc.invalidateQueries({ queryKey: ["metrics"] });
      onClose();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка удаления", "error");
    } finally {
      setChanging(false);
    }
  }

  const targets = order ? allowedTargets(order.status) : [];

  const header = (
    <div className="flex items-center gap-2.5">
      <span className="font-mono text-[15px] font-black text-[var(--text)]">
        {order ? shortId(order.id) : "Заказ"}
      </span>
      {order && <StatusBadge status={order.status} />}
    </div>
  );

  return (
    <>
      <Drawer
        open={!!orderId}
        onClose={onClose}
        header={header}
        width="max-w-xl"
        zClass="z-[120]"
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* Tabs */}
          <div className="flex gap-2 border-b-[3px] border-[var(--border)] px-3 py-2.5">
            {(["details", "chat"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex items-center gap-1.5 rounded-[var(--r-sm)] border-2 px-3.5 py-2 text-[12px] font-black uppercase tracking-wide transition-colors",
                  tab === t
                    ? "border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[var(--shadow-1)]"
                    : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                )}
              >
                {t === "details" ? (
                  <>
                    <FileText className="h-3.5 w-3.5" /> Детали
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-3.5 w-3.5" /> Чат
                  </>
                )}
              </button>
            ))}
          </div>

          {tab === "details" ? (
            <>
              <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-5">
                {isLoading || !order ? (
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-28 rounded-[var(--r-md)]" />
                    <Skeleton className="h-44 rounded-[var(--r-md)]" />
                    <Skeleton className="h-32 rounded-[var(--r-md)]" />
                  </div>
                ) : (
                  <DetailBody order={order} />
                )}
              </div>

              {/* Action bar */}
              {order && (targets.length > 0 || isTerminal) && (
                <div className="flex flex-wrap items-center gap-2 border-t-[3px] border-[var(--border)] px-5 py-4">
                  {targets.map((target) => {
                    const meta = ACTION_META[target];
                    const Icon = meta.icon;
                    return (
                      <Button
                        key={target}
                        size="sm"
                        variant={meta.variant}
                        loading={changing && pendingTarget === null}
                        icon={<Icon className="h-4 w-4" />}
                        onClick={() => requestStatus(target)}
                      >
                        {meta.label}
                      </Button>
                    );
                  })}
                  {isTerminal && (
                    <Button
                      size="sm"
                      variant="danger"
                      className="ml-auto"
                      loading={changing}
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={applyDelete}
                    >
                      Удалить навсегда
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex min-h-0 flex-1 p-5">
              {orderId && <OrderChat orderId={orderId} />}
            </div>
          )}
        </div>
      </Drawer>

      <StatusChangeModal
        open={pendingTarget !== null}
        target={pendingTarget}
        loading={changing}
        onClose={() => setPendingTarget(null)}
        onConfirm={applyStatus}
      />
    </>
  );
}

function Row({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-[14px] text-[var(--text)]">
      <span className="text-[var(--text-muted)]">{icon}</span>
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <h3 className="mb-3 text-[12px] font-black uppercase tracking-wide text-[var(--text-faint)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailBody({ order }: { order: OrderDetailDto }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Customer */}
      <Section title="Клиент">
        <div className="flex flex-col gap-2">
          <Row icon={<User className="h-4 w-4" />}>{order.customerName}</Row>
          <Row icon={<Phone className="h-4 w-4" />}>{order.phone}</Row>
          {order.tgUsername ? (
            <a
              href={`https://t.me/${order.tgUsername.replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-[14px] text-[var(--accent)] hover:underline"
            >
              <ExternalLink className="h-4 w-4" />@
              {order.tgUsername.replace(/^@/, "")}
            </a>
          ) : order.tgUserId ? (
            <a
              href={`tg://user?id=${order.tgUserId}`}
              className="flex items-center gap-2 text-[14px] text-[var(--accent)] hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              Открыть в Telegram (без @username)
            </a>
          ) : null}
          {order.comment && (
            <p className="mt-1 text-[13px] text-[var(--text-muted)]">
              {order.comment}
            </p>
          )}
        </div>
      </Section>

      {/* Items */}
      <Section title="Состав">
        <div className="flex flex-col gap-3">
          {order.items.map((it, i) => (
            <div key={it.id ?? i} className="flex items-center gap-3">
              <Image
                src={it.imageUrl ?? undefined}
                alt={it.title}
                size={96}
                className="h-12 w-12 shrink-0 rounded-[var(--r-sm)] border-2 border-[var(--line)]"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] text-[var(--text)]">
                  {it.title}
                </div>
                {it.variantName && (
                  <div className="text-[12px] text-[var(--text-faint)]">
                    {it.variantName}
                  </div>
                )}
              </div>
              <div className="text-right text-[13px]">
                <div className="text-[var(--text-muted)]">×{it.quantity}</div>
                <div className="font-semibold text-[var(--text)]">
                  {money(it.priceMinor, order.currency)}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1 border-t-2 border-[var(--border)] pt-3 text-[13px]">
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
          <div className="flex justify-between text-[16px] font-black text-[var(--text)]">
            <span>Итого</span>
            <span>{money(order.totalMinor, order.currency)}</span>
          </div>
        </div>
      </Section>

      {/* Requisites */}
      {order.requisites && hasRequisites(order.requisites) && (
        <Section title="Реквизиты">
          <div className="flex flex-col gap-1.5 text-[13px]">
            {order.requisites.cardNumber && (
              <ReqRow label="Карта" value={order.requisites.cardNumber} mono />
            )}
            {order.requisites.iban && (
              <ReqRow label="IBAN" value={order.requisites.iban} mono />
            )}
            {order.requisites.recipient && (
              <ReqRow label="Получатель" value={order.requisites.recipient} />
            )}
            {order.requisites.edrpou && (
              <ReqRow label="ЕДРПОУ" value={order.requisites.edrpou} mono />
            )}
            {order.requisites.purpose && (
              <ReqRow label="Назначение" value={order.requisites.purpose} />
            )}
            {order.requisites.note && (
              <ReqRow label="Примечание" value={order.requisites.note} />
            )}
          </div>
        </Section>
      )}

      {/* Delivery + payment */}
      <Section title="Доставка и оплата">
        <div className="flex flex-col gap-2">
          <Row
            icon={
              order.deliveryMethod === "NOVA_POSHTA" ? (
                <Truck className="h-4 w-4" />
              ) : (
                <Store className="h-4 w-4" />
              )
            }
          >
            {DELIVERY_LABEL[order.deliveryMethod]}
            {order.npCityName && (
              <span className="text-[var(--text-muted)]">
                {" "}· {order.npCityName}
                {order.npWarehouseName ? `, ${order.npWarehouseName}` : ""}
              </span>
            )}
          </Row>
          {order.paymentOptionTitle && (
            <Row icon={<CreditCard className="h-4 w-4" />}>
              {order.paymentOptionTitle}
            </Row>
          )}
          {order.trackingNumber && (
            <Row icon={<Truck className="h-4 w-4" />}>
              ТТН: <span className="font-mono">{order.trackingNumber}</span>
            </Row>
          )}
        </div>
      </Section>

      {/* Timeline */}
      <Section title="Таймлайн">
        {order.status === "REJECTED" && order.rejectReason && (
          <div className="mb-3 flex items-start gap-2 rounded-[var(--r-sm)] border-2 border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] p-2.5">
            <Ban className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
            <p className="text-[13px] font-semibold text-[var(--danger)]">
              <span className="font-bold uppercase tracking-wide opacity-80">
                Причина отклонения:
              </span>{" "}
              {order.rejectReason}
            </p>
          </div>
        )}
        <Timeline order={order} />
      </Section>
    </div>
  );
}

function hasRequisites(r: NonNullable<OrderDetailDto["requisites"]>): boolean {
  return Boolean(
    r.cardNumber || r.iban || r.recipient || r.edrpou || r.purpose || r.note
  );
}

function ReqRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[var(--text-faint)]">{label}</span>
      <span
        className={cn(
          "text-right text-[var(--text)]",
          mono && "font-mono"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Timeline({ order }: { order: OrderDetailDto }) {
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
              className="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] text-[12px] font-black"
              style={{
                background: done ? STATUS_VAR[s] : "var(--surface-3)",
                color: done ? "var(--accent-ink)" : "var(--text-faint)",
              }}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={
                done
                  ? "text-[14px] font-semibold text-[var(--text)]"
                  : "text-[14px] text-[var(--text-faint)]"
              }
            >
              {STATUS_LABEL[s]}
            </span>
            {ts && (
              <span className="ml-auto text-[11px] text-[var(--text-faint)]">
                {formatDateTime(ts)}
              </span>
            )}
          </li>
        );
      })}
      {rejected && (
        <li className="flex items-center gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--danger)] text-[12px] font-black text-[var(--accent-ink)]">
            ✕
          </span>
          <span className="text-[14px] font-semibold text-[var(--danger)]">
            {STATUS_LABEL.REJECTED}
          </span>
          {order.rejectedAt && (
            <span className="ml-auto text-[11px] text-[var(--text-faint)]">
              {formatDateTime(order.rejectedAt)}
            </span>
          )}
        </li>
      )}
    </ol>
  );
}
