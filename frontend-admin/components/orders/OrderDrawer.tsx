"use client";

/**
 * OrderDrawer — order detail (design doc §6ter.2): right drawer on desktop,
 * full-screen on mobile. Header with status, details, items, status timeline,
 * action buttons, and embedded chat.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Phone,
  User,
  Truck,
  Store,
  CreditCard,
  MessageSquare,
  Check,
  Send,
  PackageCheck,
  Ban,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";
import {
  adminApi,
  ApiError,
  type OrderDetailDto,
  type OrderStatus,
} from "@/lib/api";
import { money } from "@/lib/money";
import {
  STATUS_EMOJI,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_VAR,
  DELIVERY_LABEL,
  allowedTargets,
  shortId,
  formatDateTime,
} from "@/lib/orders";
import { Image } from "@/lib/image";
import { Badge } from "@/components/ui/Badge";
import { GlassButton } from "@/components/ui/GlassButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/lib/toast";
import { OrderChat } from "./OrderChat";
import { StatusChangeModal, type StatusChangePayload } from "./StatusChangeModal";

interface Props {
  orderId: string | null;
  onClose: () => void;
}

const ACTION_META: Record<
  OrderStatus,
  { label: string; icon: typeof Check; variant: "accent" | "glass" | "danger" }
> = {
  NEW: { label: "В новые", icon: Check, variant: "glass" },
  APPROVED: { label: "Одобрить", icon: Check, variant: "accent" },
  SHIPPED: { label: "Выслать (+ТТН)", icon: Send, variant: "accent" },
  DELIVERED: { label: "Доставлено", icon: PackageCheck, variant: "accent" },
  REJECTED: { label: "Отклонить", icon: Ban, variant: "danger" },
};

export function OrderDrawer({ orderId, onClose }: Props) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [tab, setTab] = useState<"details" | "chat">("details");
  const [pendingTarget, setPendingTarget] = useState<OrderStatus | null>(null);
  const [changing, setChanging] = useState(false);

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
  const isTerminal = !!order && (order.status === "DELIVERED" || order.status === "REJECTED");

  async function applyDelete() {
    if (!orderId) return;
    if (!window.confirm(
      "Удалить заказ НАВСЕГДА?\n\nВсе данные о заказе (позиции, чат) будут стёрты и он исчезнет из метрик. Действие необратимо."
    )) return;
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

  return (
    <AnimatePresence>
      {orderId && (
        <motion.div
          className="fixed inset-0 z-[70] flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="glass glass--strong relative z-10 flex h-dvh w-full flex-col sm:w-[560px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[15px] font-semibold text-[var(--text)]">
                  {order ? shortId(order.id) : "Заказ"}
                </span>
                {order && (
                  <Badge color={STATUS_VAR[order.status]}>
                    {STATUS_EMOJI[order.status]} {STATUS_LABEL[order.status]}
                  </Badge>
                )}
              </div>
              <button
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full text-[var(--text-muted)] hover:bg-white/10"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-white/10 px-3 py-2">
              {(["details", "chat"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-1.5 rounded-[var(--r-md)] px-3.5 py-2 text-[13px] font-medium transition-colors ${
                    tab === t
                      ? "text-[var(--accent-ink)] [background:var(--accent)]"
                      : "text-[var(--text-muted)] hover:bg-white/10"
                  }`}
                >
                  {t === "details" ? "Детали" : (
                    <>
                      <MessageSquare className="h-3.5 w-3.5" /> Чат
                    </>
                  )}
                </button>
              ))}
            </div>

            <div className="thin-scroll flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
              {tab === "details" ? (
                isLoading || !order ? (
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-24" />
                    <Skeleton className="h-40" />
                  </div>
                ) : (
                  <DetailBody order={order} />
                )
              ) : (
                <div className="flex min-h-[60vh] flex-1">
                  <OrderChat orderId={orderId} />
                </div>
              )}
            </div>

            {/* Action bar */}
            {tab === "details" && order && (targets.length > 0 || isTerminal) && (
              <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-5 py-4">
                {targets.map((target) => {
                  const meta = ACTION_META[target];
                  const Icon = meta.icon;
                  return (
                    <GlassButton
                      key={target}
                      size="sm"
                      variant={meta.variant}
                      loading={changing && pendingTarget === null}
                      icon={<Icon className="h-4 w-4" />}
                      onClick={() => requestStatus(target)}
                    >
                      {meta.label}
                    </GlassButton>
                  );
                })}
                {isTerminal && (
                  <GlassButton
                    size="sm"
                    variant="danger"
                    className="ml-auto"
                    loading={changing}
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={applyDelete}
                  >
                    Удалить навсегда
                  </GlassButton>
                )}
              </div>
            )}
          </motion.aside>

          <StatusChangeModal
            open={pendingTarget !== null}
            target={pendingTarget}
            loading={changing}
            onClose={() => setPendingTarget(null)}
            onConfirm={applyStatus}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[14px] text-[var(--text)]">
      <span className="text-[var(--text-muted)]">{icon}</span>
      {children}
    </div>
  );
}

function DetailBody({ order }: { order: OrderDetailDto }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Customer */}
      <section className="glass rounded-[var(--r-md)] p-4">
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
          Клиент
        </h3>
        <div className="flex flex-col gap-2">
          <Row icon={<User className="h-4 w-4" />}>{order.customerName}</Row>
          <Row icon={<Phone className="h-4 w-4" />}>{order.phone}</Row>
          {order.tgUsername ? (
            <a
              href={`https://t.me/${order.tgUsername.replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-[14px] text-[var(--accent)]"
            >
              <ExternalLink className="h-4 w-4" />@{order.tgUsername.replace(/^@/, "")}
            </a>
          ) : order.tgUserId ? (
            <a
              href={`tg://user?id=${order.tgUserId}`}
              className="flex items-center gap-2 text-[14px] text-[var(--accent)]"
            >
              <ExternalLink className="h-4 w-4" />Открыть в Telegram (без @username)
            </a>
          ) : null}
          {order.comment && (
            <p className="mt-1 text-[13px] text-[var(--text-muted)]">{order.comment}</p>
          )}
        </div>
      </section>

      {/* Items */}
      <section className="glass rounded-[var(--r-md)] p-4">
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
          Состав
        </h3>
        <div className="flex flex-col gap-3">
          {order.items.map((it, i) => (
            <div key={it.id ?? i} className="flex items-center gap-3">
              <Image
                src={it.imageUrl ?? undefined}
                alt={it.title}
                size={96}
                className="h-12 w-12 shrink-0 rounded-[var(--r-sm)]"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] text-[var(--text)]">{it.title}</div>
                {it.variantName && (
                  <div className="text-[12px] text-[var(--text-faint)]">{it.variantName}</div>
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
        <div className="mt-4 space-y-1 border-t border-white/10 pt-3 text-[13px]">
          <div className="flex justify-between text-[var(--text-muted)]">
            <span>Сумма</span>
            <span>{money(order.subtotalMinor, order.currency)}</span>
          </div>
          {order.discountMinor > 0 && (
            <div className="flex justify-between text-[var(--ok)]">
              <span>Скидка{order.promoCode ? ` (${order.promoCode})` : ""}</span>
              <span>−{money(order.discountMinor, order.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-[15px] font-bold text-[var(--text)]">
            <span>Итого</span>
            <span>{money(order.totalMinor, order.currency)}</span>
          </div>
        </div>
      </section>

      {/* Delivery + payment */}
      <section className="glass rounded-[var(--r-md)] p-4">
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
          Доставка и оплата
        </h3>
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
            <Row icon={<CreditCard className="h-4 w-4" />}>{order.paymentOptionTitle}</Row>
          )}
          {order.trackingNumber && (
            <Row icon={<Truck className="h-4 w-4" />}>
              ТТН: <span className="font-mono">{order.trackingNumber}</span>
            </Row>
          )}
        </div>
      </section>

      {/* Timeline */}
      <section className="glass rounded-[var(--r-md)] p-4">
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
          Таймлайн
        </h3>
        {order.status === "REJECTED" && order.rejectReason && (
          <div className="mb-3 flex items-start gap-2 rounded-[var(--r-sm)] p-2.5 [background:color-mix(in_srgb,var(--danger)_14%,transparent)]">
            <Ban className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
            <p className="text-[13px] text-[var(--danger)]">
              <span className="opacity-70">Причина отклонения:</span> {order.rejectReason}
            </p>
          </div>
        )}
        <Timeline order={order} />
      </section>
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
      case "NEW": return order.createdAt;
      case "APPROVED": return order.approvedAt;
      case "SHIPPED": return order.shippedAt;
      case "DELIVERED": return order.deliveredAt;
      case "REJECTED": return order.rejectedAt;
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
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px]"
              style={{
                background: done
                  ? `color-mix(in srgb, ${STATUS_VAR[s]} 30%, transparent)`
                  : "var(--glass-bg)",
                color: done ? STATUS_VAR[s] : "var(--text-faint)",
              }}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={done ? "text-[14px] text-[var(--text)]" : "text-[14px] text-[var(--text-faint)]"}>
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
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-[12px] text-[var(--danger)]">
            ✕
          </span>
          <span className="text-[14px] text-[var(--danger)]">{STATUS_LABEL.REJECTED}</span>
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
