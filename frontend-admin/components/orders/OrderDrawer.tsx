"use client";

/**
 * OrderDrawer — order card in the neo `Drawer` shell.
 * Header: short id + status/payment/source badges (they wrap — the × must stay on a phone screen).
 * Tabs: Детали / Чат (unread counter) / История (admin action log).
 * Footer: on desktop every action; on a phone one main action for the status + "⋯" for the rest.
 * Every action has its own spinner; destructive ones ask first (own modal, not window.confirm).
 * The phone/browser "Назад" closes the card instead of leaving the page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  FileText,
  History,
  Check,
  Send,
  PackageCheck,
  Ban,
  Trash2,
  WalletMinimal,
  MoreHorizontal,
  Undo2,
  Repeat,
} from "lucide-react";
import { adminApi, ApiError, type OrderStatus, type UserCardDto } from "@/lib/api";
import { ordersApi, type AdminOrderDetail, type DeliveryPatch, type ExchangeBody, type ReturnBody } from "@/lib/orders-api";
import { allowedTargets, shortId, STATUS_ACTION_LABEL, STATUS_LABEL } from "@/lib/orders";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { useIsDesktop } from "@/lib/use-media";
import { useBackToClose } from "@/lib/use-back-close";
import { StatusBadge } from "@/components/ui/Badge";
import { PaymentBadge } from "@/components/orders/PaymentBadge";
import { SourceBadge } from "@/components/orders/SourceBadge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Drawer } from "@/components/ui/Drawer";
import { QueryState } from "@/components/ui/QueryState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { UserProfileDrawer } from "@/components/users/UserProfileDrawer";
import { OrderChat } from "./OrderChat";
import { OrderDetails } from "./OrderDetails";
import { OrderHistory } from "./OrderHistory";
import { StatusChangeModal, type StatusChangePayload } from "./StatusChangeModal";
import { PaymentModal } from "./PaymentModal";
import { ItemPicker } from "./ItemPicker";
import { DiscountModal } from "./DiscountModal";
import { TrackingModal } from "./TrackingModal";
import { DeliveryEditModal } from "./DeliveryEditModal";
import { ReturnModal } from "./ReturnModal";
import { ExchangeModal } from "./ExchangeModal";
import { ActionSheet, type SheetAction } from "./ActionSheet";

type Tab = "details" | "chat" | "history";

interface Props {
  orderId: string | null;
  onClose: () => void;
  initialTab?: "details" | "chat";
  /** Scroll to the «Онлайн-оплата» section once the order has loaded («Внимание» → «Оплаты»). */
  initialAction?: "payment";
  /** `onClose` navigates to another page (the /orders/{id} deep link) — see useBackToClose. */
  closeNavigates?: boolean;
}

const ACTION_ICON: Record<Exclude<OrderStatus, "NEW">, typeof Check> = {
  APPROVED: Check,
  SHIPPED: Send,
  DELIVERED: PackageCheck,
  REJECTED: Ban,
};

/** The one big button on a phone: the next step of the happy path. */
const PRIMARY_TARGET: Partial<Record<OrderStatus, OrderStatus>> = {
  NEW: "APPROVED",
  APPROVED: "SHIPPED",
  SHIPPED: "DELIVERED",
};

/** Transitions that open a modal (extra input or an explicit confirmation). */
const NEEDS_MODAL: OrderStatus[] = ["SHIPPED", "REJECTED", "DELIVERED"];

export function OrderDrawer({ orderId, onClose, initialTab = "details", initialAction, closeNavigates }: Props) {
  const qc = useQueryClient();
  const { push } = useToast();
  const isDesktop = useIsDesktop();
  const [confirm, confirmUi] = useConfirm();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<OrderStatus | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [profile, setProfile] = useState<UserCardDto | null>(null);

  const close = useBackToClose(!!orderId, onClose, { marker: "orderDrawer", navigatesAway: closeNavigates });

  // Re-sync the active tab and drop per-order UI state when the drawer is (re)opened for a new order.
  useEffect(() => {
    if (!orderId) return;
    setTab(initialTab);
    setPendingTarget(null);
    setPayOpen(false);
    setTrackingOpen(false);
    setDeliveryOpen(false);
    setReturnOpen(false);
    setExchangeOpen(false);
    setMoreOpen(false);
  }, [orderId, initialTab]);

  const orderQ = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => ordersApi.order(orderId as string),
    enabled: !!orderId,
  });
  const order: AdminOrderDetail | undefined = orderQ.data;

  // initialAction: remember which order it was asked for, scroll to the payment once it is loaded.
  const paymentRef = useRef<HTMLElement>(null);
  const [autoPaymentFor, setAutoPaymentFor] = useState<string | null>(null);
  useEffect(() => {
    setAutoPaymentFor(orderId && initialAction === "payment" ? orderId : null);
  }, [orderId, initialAction]);
  useEffect(() => {
    if (autoPaymentFor && order && autoPaymentFor === orderId && tab === "details") {
      // After the details have rendered (the section mounts with the order).
      const t = window.setTimeout(() => paymentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      setAutoPaymentFor(null);
      return () => window.clearTimeout(t);
    }
  }, [autoPaymentFor, order, orderId, tab]);

  // Unread customer messages for the "Чат" tab badge (the chat itself shares this cache entry).
  const messagesQ = useQuery({
    queryKey: ["messages", orderId],
    queryFn: () => ordersApi.messages(orderId as string),
    enabled: !!orderId,
  });
  const unread = useMemo(
    () => (messagesQ.data ?? []).filter((m) => m.senderType === "CUSTOMER" && !m.readAt).length,
    [messagesQ.data]
  );

  const refreshLists = useCallback(() => {
    if (orderId) {
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["order-audit", orderId] });
    }
    qc.invalidateQueries({ queryKey: ["board"] });
    qc.invalidateQueries({ queryKey: ["orders-table"] });
    qc.invalidateQueries({ queryKey: ["dispatch"] });
    qc.invalidateQueries({ queryKey: ["admin", "inbox"] });
  }, [qc, orderId]);

  /** Runs one action with its own spinner; returns true on success. */
  async function run(key: string, fn: () => Promise<unknown>, okText?: string, errText = "Ошибка"): Promise<boolean> {
    if (!orderId) {
      push("Заказ не выбран — откройте его заново", "error");
      return false;
    }
    setBusyKey(key);
    try {
      const updated = await fn();
      if (updated && typeof updated === "object" && "id" in updated) {
        qc.setQueryData(["order", orderId], updated);
      }
      if (okText) push(okText, "ok");
      refreshLists();
      return true;
    } catch (e) {
      push(e instanceof ApiError ? e.message : errText, "error");
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function applyStatus(payload: StatusChangePayload): Promise<boolean> {
    const id = orderId;
    if (!id) {
      push("Заказ не выбран — откройте его заново", "error");
      return false;
    }
    const ok = await run(
      `status:${payload.status}`,
      () => ordersApi.changeStatus(id, payload),
      `Статус: ${STATUS_LABEL[payload.status]}`,
      "Ошибка смены статуса"
    );
    if (ok) {
      setPendingTarget(null);
      qc.invalidateQueries({ queryKey: ["products"] });
    }
    return ok;
  }

  async function applyPayment(receivedMinor: number): Promise<boolean> {
    const id = orderId;
    if (!id) return false;
    const ok = await run(
      "pay",
      () => adminApi.setPaid(id, receivedMinor),
      receivedMinor > 0 ? "Оплата обновлена" : "Оплата снята",
      "Ошибка смены оплаты"
    );
    if (ok) setPayOpen(false);
    return ok;
  }

  async function removeItem(itemId: number, title: string) {
    const id = orderId;
    if (!id) return;
    const ok = await confirm({
      title: "Убрать позицию?",
      message: `«${title}» исчезнет из заказа, остаток вернётся на склад, сумма заказа пересчитается.`,
      confirmLabel: "Убрать",
      danger: true,
    });
    if (!ok) return;
    await run(`item:${itemId}`, () => adminApi.removeOrderItem(id, itemId), "Позиция убрана", "Не удалось убрать");
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function changeQty(itemId: number, quantity: number) {
    const id = orderId;
    if (!id || quantity < 1) return;
    await run(
      `item:${itemId}`,
      () => adminApi.changeOrderItemQty(id, itemId, { quantity, notifyCustomer: false }),
      undefined,
      "Не удалось изменить количество"
    );
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function saveTracking(ttn: string) {
    const id = orderId;
    if (!id) return;
    if (await run("tracking", () => ordersApi.updateTracking(id, ttn), "ТТН обновлена, клиент уведомлён")) {
      setTrackingOpen(false);
    }
  }

  async function saveDelivery(patch: DeliveryPatch) {
    const id = orderId;
    if (!id) return;
    if (await run("delivery", () => ordersApi.updateDelivery(id, patch), "Данные доставки обновлены")) {
      setDeliveryOpen(false);
    }
  }

  async function saveReturn(body: ReturnBody) {
    const id = orderId;
    if (!id) return;
    if (await run("return", () => ordersApi.registerReturn(id, body), "Возврат оформлен")) {
      setReturnOpen(false);
      qc.invalidateQueries({ queryKey: ["products"] });
    }
  }

  async function saveExchange(body: ExchangeBody) {
    const id = orderId;
    if (!id) return;
    const msg = body.targetStatus === "APPROVED" ? "Обмен оформлен — заказ ждёт отправки" : "Обмен оформлен — заказ снова в «Новых»";
    if (await run("exchange", () => ordersApi.exchange(id, body), msg)) {
      setExchangeOpen(false);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["order-audit", id] });
    }
  }

  function requestStatus(target: OrderStatus) {
    if (NEEDS_MODAL.includes(target)) setPendingTarget(target);
    else void applyStatus({ status: target });
  }

  async function applyDelete() {
    const id = orderId;
    if (!id) return;
    const ok = await confirm({
      title: "Удалить заказ навсегда?",
      message:
        "Все данные о заказе (позиции, чат) будут стёрты, он исчезнет из метрик. Действие необратимо.",
      confirmLabel: "Удалить навсегда",
      danger: true,
    });
    if (!ok) return;
    const done = await run("delete", () => adminApi.deleteOrder(id), "Заказ удалён навсегда", "Ошибка удаления");
    if (done) {
      // «Метрики» queries live under ["metrics2", …] — ["metrics"] matched nothing.
      qc.invalidateQueries({ queryKey: ["metrics2"] });
      close();
    }
  }

  async function openCustomer() {
    if (!order?.tgUserId) return;
    const tgId = order.tgUserId;
    try {
      const found = await ordersApi.findUser(tgId);
      setProfile(
        found ?? {
          telegramUserId: tgId,
          username: order.tgUsername?.replace(/^@/, "") ?? null,
          firstName: order.customerName,
          premium: false,
          botBlocked: false,
          ordersCount: 0,
          totalSpentMinor: 0,
        }
      );
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось открыть профиль", "error");
    }
  }

  // Hard-delete only at a terminal stage — for purging test orders. Irreversible.
  const isTerminal = !!order && (order.status === "DELIVERED" || order.status === "REJECTED");
  const canReturn =
    !!order &&
    (order.status === "SHIPPED" ||
      order.status === "DELIVERED" ||
      (order.status === "REJECTED" && order.receivedMinor > (order.refundedMinor ?? 0)) ||
      // After an exchange for something cheaper: the overpayment can go back before shipping.
      ((order.status === "NEW" || order.status === "APPROVED") &&
        order.receivedMinor - (order.refundedMinor ?? 0) > order.totalMinor));
  // Exchange: the goods reached (or are on the way to) the customer — swap them in this same order.
  const canExchange = !!order && (order.status === "SHIPPED" || order.status === "DELIVERED");
  const targets = order ? allowedTargets(order.status) : [];
  const primary = order ? PRIMARY_TARGET[order.status] : undefined;

  // Payments arrive online (monobank); this is only a manual correction (наложка, a mistake).
  const payLabel = "Скорректировать оплату";

  const header = (
    <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 pointer-coarse:min-h-11">
      <span className="font-display tabular mr-0.5 text-[17px] font-bold leading-none tracking-[0.02em] text-[var(--ink)]">
        {order ? shortId(order.id) : "Заказ"}
      </span>
      {order && <StatusBadge status={order.status} />}
      {order && <PaymentBadge order={order} />}
      {order && <SourceBadge source={order.source} />}
    </div>
  );

  const restockUnits = order?.items.reduce((s, it) => s + it.quantity - (it.returnedQty ?? 0), 0);

  // ONE solid-orange action per view (v3): the next happy-path step; the rest are surface/danger.
  // The manual payment correction is never the main action — payments come in online.
  const accentKey: string | undefined = primary;

  // ---- action bar ----
  const statusButton = (target: OrderStatus, opts: { primary?: boolean; full?: boolean } = {}) => {
    const t = target as Exclude<OrderStatus, "NEW">;
    const Icon = ACTION_ICON[t];
    return (
      <Button
        key={target}
        size={opts.primary ? "md" : "sm"}
        variant={target === "REJECTED" ? "danger" : opts.primary || accentKey === target ? "accent" : "surface"}
        loading={busyKey === `status:${target}`}
        disabled={!!busyKey && busyKey !== `status:${target}`}
        icon={<Icon className="h-4 w-4" />}
        className={cn(opts.full && "flex-1")}
        onClick={() => requestStatus(target)}
      >
        {STATUS_ACTION_LABEL[target]}
      </Button>
    );
  };

  const payButton = (full?: boolean) =>
    order && (
      <Button
        size={full ? "md" : "sm"}
        variant="surface"
        loading={busyKey === "pay"}
        disabled={!!busyKey && busyKey !== "pay"}
        className={cn(full && "flex-1")}
        icon={<WalletMinimal className="h-4 w-4" />}
        onClick={() => setPayOpen(true)}
      >
        {payLabel}
      </Button>
    );

  const sheetActions: SheetAction[] = order
    ? [
        {
          key: "pay",
          label: payLabel,
          icon: <WalletMinimal className="h-4 w-4" />,
          onSelect: () => setPayOpen(true),
        },
        ...targets
          .filter((t) => t !== primary)
          .map((t) => {
            const Icon = ACTION_ICON[t as Exclude<OrderStatus, "NEW">];
            return {
              key: t,
              label: STATUS_ACTION_LABEL[t],
              icon: <Icon className="h-4 w-4" />,
              danger: t === "REJECTED",
              onSelect: () => requestStatus(t),
            };
          }),
        ...(canExchange
          ? [{ key: "exchange", label: "Обмен", icon: <Repeat className="h-4 w-4" />, onSelect: () => setExchangeOpen(true) }]
          : []),
        ...(canReturn
          ? [{ key: "return", label: "Возврат", icon: <Undo2 className="h-4 w-4" />, onSelect: () => setReturnOpen(true) }]
          : []),
        ...(isTerminal
          ? [
              {
                key: "delete",
                label: "Удалить навсегда",
                icon: <Trash2 className="h-4 w-4" />,
                danger: true,
                onSelect: () => void applyDelete(),
              },
            ]
          : []),
      ]
    : [];

  return (
    <>
      <Drawer open={!!orderId} onClose={close} header={header} width="max-w-[680px]" zClass="z-[120]">
        <div className="flex h-full min-h-0 flex-col">
          {/* Tabs — SegmentedControl look: --bg-2 track, active = orange tint + orange hairline */}
          <div className="shrink-0 border-b border-[var(--line)] px-4 py-2.5 sm:px-5">
          <div className="flex gap-0.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-[3px] sm:inline-flex">
            {(
              [
                ["details", "Детали", FileText],
                ["chat", "Чат", MessageSquare],
                ["history", "История", History],
              ] as const
            ).map(([t, label, Icon]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "font-display hit flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[var(--r-sm)] border px-3 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors sm:flex-none pointer-coarse:h-10",
                  tab === t
                    ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
                {t === "chat" && unread > 0 && <span className="count-badge count-badge--danger">{unread}</span>}
              </button>
            ))}
          </div>
          </div>

          {tab === "details" && (
            <>
              <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                {orderQ.isError ? (
                  <QueryState isLoading={false} isError error={orderQ.error} refetch={orderQ.refetch}>
                    {null}
                  </QueryState>
                ) : orderQ.isLoading || !order ? (
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-28 rounded-[var(--r-md)]" />
                    <Skeleton className="h-44 rounded-[var(--r-md)]" />
                    <Skeleton className="h-32 rounded-[var(--r-md)]" />
                  </div>
                ) : (
                  <OrderDetails
                    order={order}
                    h={{
                      busyKey,
                      onChangeQty: changeQty,
                      onRemoveItem: removeItem,
                      onAddItem: () => setGiftOpen(true),
                      onDiscount: () => setDiscountOpen(true),
                      onEditDelivery: () => setDeliveryOpen(true),
                      onEditTracking: () => setTrackingOpen(true),
                      onOpenCustomer: order.tgUserId ? openCustomer : undefined,
                      onReturn: canReturn ? () => setReturnOpen(true) : undefined,
                      onExchange: canExchange ? () => setExchangeOpen(true) : undefined,
                      onPaymentChanged: refreshLists,
                      paymentRef,
                    }}
                  />
                )}
              </div>

              {/* Action bar */}
              {order &&
                (isDesktop ? (
                  <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--bg-2)] px-5 py-3.5">
                    {payButton()}
                    {targets.map((t) => statusButton(t))}
                    {isTerminal && (
                      <Button
                        size="sm"
                        variant="danger"
                        className="ml-auto"
                        loading={busyKey === "delete"}
                        disabled={!!busyKey && busyKey !== "delete"}
                        icon={<Trash2 className="h-4 w-4" />}
                        onClick={applyDelete}
                      >
                        Удалить навсегда
                      </Button>
                    )}
                  </div>
                ) : (
                  <div
                    className="flex shrink-0 items-center gap-2 border-t border-[var(--line)] bg-[var(--bg-2)] px-4 pt-3"
                    style={{ paddingBottom: "calc(12px + var(--safe-bottom, 0px))" }}
                  >
                    {primary ? statusButton(primary, { primary: true, full: true }) : payButton(true)}
                    <Button
                      size="md"
                      variant="surface"
                      aria-label="Другие действия"
                      icon={<MoreHorizontal className="h-5 w-5" />}
                      onClick={() => setMoreOpen(true)}
                    />
                  </div>
                ))}
            </>
          )}

          {tab === "chat" && (
            <div className="flex min-h-0 flex-1 p-3 pb-[calc(12px+var(--safe-bottom))] sm:p-5 sm:pb-[calc(20px+var(--safe-bottom))]">{orderId && <OrderChat key={orderId} orderId={orderId} />}</div>
          )}

          {tab === "history" && (
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {orderId && <OrderHistory orderId={orderId} />}
            </div>
          )}
        </div>
      </Drawer>

      <ActionSheet
        open={moreOpen && !isDesktop}
        title={order ? `Заказ ${shortId(order.id)}` : undefined}
        actions={primary ? sheetActions : sheetActions.filter((a) => a.key !== "pay")}
        onClose={() => setMoreOpen(false)}
      />

      <StatusChangeModal
        open={pendingTarget !== null}
        target={pendingTarget}
        order={
          order
            ? {
                id: order.id,
                label: `${shortId(order.id)} · ${order.customerName}`,
                totalMinor: order.totalMinor,
                currency: order.currency,
                restockUnits,
                deliveryMethod: order.deliveryMethod,
              }
            : null
        }
        loading={!!pendingTarget && busyKey === `status:${pendingTarget}`}
        onClose={() => setPendingTarget(null)}
        onConfirm={applyStatus}
      />

      <PaymentModal
        open={payOpen}
        order={order ?? null}
        loading={busyKey === "pay"}
        onClose={() => setPayOpen(false)}
        onConfirm={applyPayment}
      />

      <TrackingModal
        open={trackingOpen}
        orderId={orderId}
        current={order?.trackingNumber}
        loading={busyKey === "tracking"}
        onClose={() => setTrackingOpen(false)}
        onSave={saveTracking}
      />

      <DeliveryEditModal
        open={deliveryOpen}
        order={order ?? null}
        loading={busyKey === "delivery"}
        onClose={() => setDeliveryOpen(false)}
        onSave={saveDelivery}
      />

      <ReturnModal
        open={returnOpen}
        order={order ?? null}
        loading={busyKey === "return"}
        onClose={() => setReturnOpen(false)}
        onSave={saveReturn}
      />

      <ExchangeModal
        open={exchangeOpen}
        order={order ?? null}
        loading={busyKey === "exchange"}
        onClose={() => setExchangeOpen(false)}
        onSave={saveExchange}
      />

      <ItemPicker
        open={giftOpen}
        orderId={orderId}
        onClose={() => setGiftOpen(false)}
        onDone={refreshLists}
      />

      <DiscountModal
        open={discountOpen}
        order={order ?? null}
        onClose={() => setDiscountOpen(false)}
        onDone={refreshLists}
      />

      {/* The customer's profile opens OVER the order (rendered later → on top), Esc/× return here. */}
      <UserProfileDrawer user={profile} onClose={() => setProfile(null)} />

      {confirmUi}
    </>
  );
}
