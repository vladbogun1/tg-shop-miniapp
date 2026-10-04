"use client";

/**
 * OrderDrawer — order card in the neo `Drawer` shell.
 * Header: short id + status/payment/source badges (they wrap — the × must stay on a phone screen).
 * Tabs: Детали / Чат (unread counter) / История (admin action log).
 * Footer: on desktop every action; on a phone one main action for the status + "⋯" for the rest.
 * Every action has its own spinner; destructive ones ask first (own modal, not window.confirm).
 * The phone/browser "Назад" closes the card instead of leaving the page.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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
  Wallet,
  WalletMinimal,
  MoreHorizontal,
  Undo2,
} from "lucide-react";
import { adminApi, ApiError, type OrderStatus, type UserCardDto } from "@/lib/api";
import { ordersApi, type AdminOrderDetail, type DeliveryPatch, type ReturnBody } from "@/lib/orders-api";
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
import { ActionSheet, type SheetAction } from "./ActionSheet";

type Tab = "details" | "chat" | "history";

interface Props {
  orderId: string | null;
  onClose: () => void;
  initialTab?: "details" | "chat";
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

export function OrderDrawer({ orderId, onClose, initialTab = "details", closeNavigates }: Props) {
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
    setMoreOpen(false);
  }, [orderId, initialTab]);

  const orderQ = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => ordersApi.order(orderId as string),
    enabled: !!orderId,
  });
  const order: AdminOrderDetail | undefined = orderQ.data;

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
      qc.invalidateQueries({ queryKey: ["metrics"] });
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
      (order.status === "REJECTED" && order.receivedMinor > (order.refundedMinor ?? 0)));
  const targets = order ? allowedTargets(order.status) : [];
  const primary = order ? PRIMARY_TARGET[order.status] : undefined;

  const payLabel = !order
    ? ""
    : order.paid
      ? "Изменить оплату"
      : order.paymentClaimed
        ? "Проверить оплату"
        : "Отметить оплаченным";

  const header = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <span className="font-mono text-[15px] font-black text-[var(--text)]">
        {order ? shortId(order.id) : "Заказ"}
      </span>
      {order && <StatusBadge status={order.status} />}
      {order && <PaymentBadge order={order} />}
      {order && <SourceBadge source={order.source} />}
    </div>
  );

  const restockUnits = order?.items.reduce((s, it) => s + it.quantity - (it.returnedQty ?? 0), 0);

  // ---- action bar ----
  const statusButton = (target: OrderStatus, opts: { primary?: boolean; full?: boolean } = {}) => {
    const t = target as Exclude<OrderStatus, "NEW">;
    const Icon = ACTION_ICON[t];
    return (
      <Button
        key={target}
        size={opts.primary ? "md" : "sm"}
        variant={target === "REJECTED" ? "danger" : opts.primary || target !== "DELIVERED" ? "accent" : "surface"}
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
        variant={order.paid ? "surface" : "accent"}
        loading={busyKey === "pay"}
        disabled={!!busyKey && busyKey !== "pay"}
        className={cn(full && "flex-1")}
        icon={order.paid ? <WalletMinimal className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
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
          icon: <Wallet className="h-4 w-4" />,
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

  // A paid-claim waiting for review is the most urgent thing on a NEW order: make it the main button.
  const mobilePrimaryIsPay = !!order && !order.paid && order.paymentClaimed && order.status === "NEW";

  return (
    <>
      <Drawer open={!!orderId} onClose={close} header={header} width="max-w-xl" zClass="z-[120]">
        <div className="flex h-full min-h-0 flex-col">
          {/* Tabs */}
          <div className="flex gap-2 border-b-[3px] border-[var(--border)] px-3 py-2.5">
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
                  "flex items-center gap-1.5 rounded-[var(--r-sm)] border-2 px-3 py-2 text-[12px] font-black uppercase tracking-wide transition-colors",
                  tab === t
                    ? "border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[var(--shadow-1)]"
                    : "border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
                {t === "chat" && unread > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full border-2 border-[var(--line)] bg-[var(--danger)] px-1 text-[10px] font-black text-[var(--accent-ink)]">
                    {unread}
                  </span>
                )}
              </button>
            ))}
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
                    }}
                  />
                )}
              </div>

              {/* Action bar */}
              {order &&
                (isDesktop ? (
                  <div className="flex flex-wrap items-center gap-2 border-t-[3px] border-[var(--border)] px-5 py-4">
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
                    className="flex items-center gap-2 border-t-[3px] border-[var(--border)] px-4 py-3"
                    style={{ paddingBottom: "calc(12px + var(--safe-bottom, 0px))" }}
                  >
                    {mobilePrimaryIsPay
                      ? payButton(true)
                      : primary
                        ? statusButton(primary, { primary: true, full: true })
                        : payButton(true)}
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
            <div className="flex min-h-0 flex-1 p-3 sm:p-5">{orderId && <OrderChat key={orderId} orderId={orderId} />}</div>
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
        actions={
          mobilePrimaryIsPay
            ? sheetActions
                .filter((a) => a.key !== "pay")
                .concat(
                  primary
                    ? [
                        {
                          key: `primary-${primary}`,
                          label: STATUS_ACTION_LABEL[primary],
                          onSelect: () => requestStatus(primary),
                        },
                      ]
                    : []
                )
            : primary
              ? sheetActions
              : sheetActions.filter((a) => a.key !== "pay")
        }
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
