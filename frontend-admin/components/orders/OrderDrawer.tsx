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
  Archive,
  ArchiveRestore,
  WalletMinimal,
  MoreHorizontal,
  Undo2,
  Repeat,
} from "lucide-react";
import { adminApi, ApiError, type OrderStatus, type UserCardDto } from "@/lib/api";
import {
  changeStatusConfirmingUnpaid,
  ordersApi,
  type AdminOrderDetail,
  type DeliveryPatch,
  type ExchangeBody,
  type ReturnReceivedBody,
  type ReturnWizardBody,
} from "@/lib/orders-api";
import type { MovementChannel } from "@/lib/orders";
import { allowedTargets, shortId, STATUS_ACTION_LABEL, STATUS_LABEL } from "@/lib/orders";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { useIsDesktop } from "@/lib/use-media";
import { useBackToClose } from "@/lib/use-back-close";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { PaymentBadge } from "@/components/orders/PaymentBadge";
import { SourceBadge } from "@/components/orders/SourceBadge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Drawer } from "@/components/ui/Drawer";
import { QueryState } from "@/components/ui/QueryState";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { UserProfileDrawer } from "@/components/users/UserProfileDrawer";
import { useIsSuperAdmin } from "@/components/layout/Shell";
import { ReturnBadge } from "./ReturnBadge";
import { ReturnReceivedModal } from "./ReturnReceivedModal";
import { ArchiveModal } from "./ArchiveModal";
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
import { GiftCaseModal } from "./GiftCaseModal";
import { CASE_RARITY_LABEL } from "@/lib/gift";
import { caseDiscountText, type CaseTier } from "@shop/shared";
import { money } from "@/lib/money";
import { ActionSheet, type SheetAction } from "./ActionSheet";

type Tab = "details" | "chat" | "history";

interface Props {
  orderId: string | null;
  onClose: () => void;
  initialTab?: "details" | "chat";
  /**
   * Once the order has loaded: «payment» scrolls to «Онлайн-оплата» («Внимание» → «Оплаты»),
   * «return» opens the return wizard, «received» opens «Посылка вернулась» (board «Едет назад»).
   */
  initialAction?: "payment" | "return" | "received";
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

export function OrderDrawer({ orderId: propId, onClose, initialTab = "details", initialAction, closeNavigates }: Props) {
  // An exchange opens its new order in the same drawer; the links between the two switch back and
  // forth. Opening another order from outside starts over from it.
  const [jumped, setJumped] = useState<string | null>(null);
  useEffect(() => setJumped(null), [propId]);
  const orderId = propId ? jumped ?? propId : null;
  const qc = useQueryClient();
  const { push } = useToast();
  const isDesktop = useIsDesktop();
  const [confirm, confirmUi] = useConfirm();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<OrderStatus | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [receivedOpen, setReceivedOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const isSuper = useIsSuperAdmin() === true;
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
    setReceivedOpen(false);
    setArchiveOpen(false);
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
  const [autoModalFor, setAutoModalFor] = useState<string | null>(null);
  useEffect(() => {
    setAutoModalFor(orderId && (initialAction === "return" || initialAction === "received") ? orderId : null);
  }, [orderId, initialAction]);
  useEffect(() => {
    if (autoModalFor && order && autoModalFor === orderId) {
      if (initialAction === "return") setReturnOpen(true);
      else if (initialAction === "received" && order.admin?.returnStatus === "IN_TRANSIT") setReceivedOpen(true);
      setAutoModalFor(null);
    }
  }, [autoModalFor, order, orderId, initialAction]);
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
      // Only this order's own detail (an exchange answers with its new order).
      if (updated && typeof updated === "object" && "id" in updated && updated.id === orderId) {
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
    // SHIPPED without the online payment asks the admin first (server code ORDER_UNPAID_SHIP).
    let declined = false;
    const ok = await run(
      `status:${payload.status}`,
      async () => {
        const updated = await changeStatusConfirmingUnpaid(id, payload, confirm);
        if (updated === null) declined = true;
        return updated;
      },
      undefined,
      "Ошибка смены статуса"
    );
    if (ok && !declined) {
      push(`Статус: ${STATUS_LABEL[payload.status]}`, "ok");
      setPendingTarget(null);
      qc.invalidateQueries({ queryKey: ["products"] });
    }
    return ok && !declined;
  }

  async function applyPayment(receivedMinor: number, channel?: MovementChannel, note?: string): Promise<boolean> {
    const id = orderId;
    if (!id) return false;
    const ok = await run(
      "pay",
      () => ordersApi.setPaid(id, { receivedMinor, channel: receivedMinor > 0 ? channel : undefined, note }),
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

  async function saveReturn(body: ReturnWizardBody) {
    const id = orderId;
    if (!id) return;
    setBusyKey("return");
    try {
      const updated = await ordersApi.registerReturn(id, body);
      qc.setQueryData(["order", id], updated);
      push("Возврат оформлен", "ok");
      setReturnOpen(false);
    } catch (e) {
      // Also MONO_REFUND_FAILED: the bank refused before anything was saved — the wizard stays open.
      push(e instanceof ApiError ? e.message : "Не удалось оформить возврат", "error");
      return;
    } finally {
      setBusyKey(null);
    }
    refreshLists();
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["metrics2"] });
  }

  async function saveReturnReceived(body: ReturnReceivedBody) {
    const id = orderId;
    if (!id) return;
    if (await run("return-received", () => ordersApi.receiveReturn(id, body), "Посылка принята, товар на складе")) {
      setReceivedOpen(false);
      qc.invalidateQueries({ queryKey: ["products"] });
    }
  }

  async function applyArchive(reason: string) {
    const id = orderId;
    if (!id) return;
    if (await run("archive", () => ordersApi.archive(id, reason), "Заказ в архиве", "Не удалось архивировать")) {
      setArchiveOpen(false);
      qc.invalidateQueries({ queryKey: ["metrics2"] });
      close();
    }
  }

  async function applyUnarchive() {
    const id = orderId;
    if (!id) return;
    const ok = await confirm({
      title: "Вернуть из архива?",
      message: "Заказ снова появится в таблице и на доске.",
      confirmLabel: "Вернуть",
    });
    if (!ok) return;
    await run("unarchive", () => ordersApi.unarchive(id), "Заказ возвращён из архива", "Не удалось вернуть из архива");
    qc.invalidateQueries({ queryKey: ["metrics2"] });
  }

  async function saveExchange(body: ExchangeBody) {
    const id = orderId;
    if (!id) return;
    let child: AdminOrderDetail | null = null;
    const ok = await run("exchange", async () => {
      child = await ordersApi.exchange(id, body);
      return child;
    });
    if (ok && child) {
      const c: AdminOrderDetail = child;
      setExchangeOpen(false);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.setQueryData(["order", c.id], c);
      push(
        `Обмен оформлен — создан заказ #${c.id.slice(0, 8)}${body.targetStatus === "APPROVED" ? ", ждёт отправки" : " в «Новых»"}`,
        "ok"
      );
      setJumped(c.id);
    }
  }

  /** «🎁 Выдать кейс»: the server draws the prize now; the toast names it. */
  async function grantCase(tier: CaseTier, notifyCustomer: boolean) {
    const id = orderId;
    if (!id) return;
    let prize = "";
    const ok = await run(
      "gift-case",
      async () => {
        const updated = await ordersApi.grantGiftCase(id, tier, notifyCustomer);
        const it = updated.items.find((x) => x.gift && x.caseRarity);
        const won = updated.gift?.prize;
        if (it?.caseRarity) prize = `${it.title} · ${CASE_RARITY_LABEL[it.caseRarity]}`;
        else if (won?.kind === "DISCOUNT") prize = `скидка ${caseDiscountText(won, (m) => money(m, updated.currency))} · ${CASE_RARITY_LABEL[won.rarity]}`;
        return updated;
      },
      undefined,
      "Не удалось выдать кейс"
    );
    if (ok) {
      push(prize ? `Выпало: ${prize}` : "Кейс выдан", "ok");
      setCaseOpen(false);
      qc.invalidateQueries({ queryKey: ["products"] });
    }
  }

  function requestStatus(target: OrderStatus) {
    if (NEEDS_MODAL.includes(target)) setPendingTarget(target);
    else void applyStatus({ status: target });
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

  // Orders are never deleted: the main admin archives a closed one (reason required).
  const isTerminal = !!order && (order.status === "DELIVERED" || order.status === "REJECTED");
  const archived = !!order?.admin?.archivedAt;
  const canArchive = isSuper && isTerminal && !archived;
  const canUnarchive = isSuper && archived;
  const inTransit = order?.admin?.returnStatus === "IN_TRANSIT";
  const canReturn =
    !!order &&
    (order.status === "SHIPPED" ||
      order.status === "DELIVERED" ||
      (order.status === "REJECTED" && order.receivedMinor > (order.refundedMinor ?? 0)) ||
      // After an exchange for something cheaper: the overpayment can go back before shipping.
      ((order.status === "NEW" || order.status === "APPROVED") &&
        order.receivedMinor - (order.refundedMinor ?? 0) > order.totalMinor));
  // Exchange: the goods reached (or are on the way to) the customer — swap them in this same order.
  // Only once the customer has the parcel: a refused one comes back through «Отклонить».
  const canExchange = !!order && order.status === "DELIVERED";
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
      {order && <ReturnBadge status={order.admin?.returnStatus} />}
      {archived && <Badge>В архиве</Badge>}
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
        ...(inTransit
          ? [{ key: "return-received", label: "Посылка вернулась", icon: <PackageCheck className="h-4 w-4" />, onSelect: () => setReceivedOpen(true) }]
          : []),
        ...(canArchive
          ? [{ key: "archive", label: "В архив", icon: <Archive className="h-4 w-4" />, danger: true, onSelect: () => setArchiveOpen(true) }]
          : []),
        ...(canUnarchive
          ? [{ key: "unarchive", label: "Вернуть из архива", icon: <ArchiveRestore className="h-4 w-4" />, onSelect: () => void applyUnarchive() }]
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
                      onGiftCase: () => setCaseOpen(true),
                      onDiscount: () => setDiscountOpen(true),
                      onEditDelivery: () => setDeliveryOpen(true),
                      onEditTracking: () => setTrackingOpen(true),
                      onOpenCustomer: order.tgUserId ? openCustomer : undefined,
                      onReturn: canReturn ? () => setReturnOpen(true) : undefined,
                      onReturnReceived: inTransit ? () => setReceivedOpen(true) : undefined,
                      onUnarchive: canUnarchive ? () => void applyUnarchive() : undefined,
                      onExchange: canExchange ? () => setExchangeOpen(true) : undefined,
                      onOpenOrder: setJumped,
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
                    {inTransit && (
                      <Button
                        size="sm"
                        variant="accent"
                        icon={<PackageCheck className="h-4 w-4" />}
                        disabled={!!busyKey}
                        onClick={() => setReceivedOpen(true)}
                      >
                        Посылка вернулась
                      </Button>
                    )}
                    {canArchive && (
                      <Button
                        size="sm"
                        variant="surface"
                        className="ml-auto"
                        loading={busyKey === "archive"}
                        disabled={!!busyKey && busyKey !== "archive"}
                        icon={<Archive className="h-4 w-4" />}
                        onClick={() => setArchiveOpen(true)}
                      >
                        В архив
                      </Button>
                    )}
                    {canUnarchive && (
                      <Button
                        size="sm"
                        variant="surface"
                        className="ml-auto"
                        loading={busyKey === "unarchive"}
                        disabled={!!busyKey && busyKey !== "unarchive"}
                        icon={<ArchiveRestore className="h-4 w-4" />}
                        onClick={() => void applyUnarchive()}
                      >
                        Вернуть из архива
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
                fromStatus: order.status,
                receivedMinor: order.receivedMinor,
                prepaymentMinor: order.prepaymentMinor,
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

      <ReturnReceivedModal
        open={receivedOpen}
        order={order ?? null}
        loading={busyKey === "return-received"}
        onClose={() => setReceivedOpen(false)}
        onSave={saveReturnReceived}
      />

      <ArchiveModal
        open={archiveOpen}
        label={order ? shortId(order.id) : undefined}
        loading={busyKey === "archive"}
        onClose={() => setArchiveOpen(false)}
        onConfirm={applyArchive}
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

      <GiftCaseModal
        open={caseOpen}
        loading={busyKey === "gift-case"}
        onClose={() => setCaseOpen(false)}
        onConfirm={(tier, notify) => void grantCase(tier, notify)}
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
