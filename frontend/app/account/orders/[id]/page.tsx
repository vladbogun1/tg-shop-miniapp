"use client";

/**
 * ORDER DETAIL (design doc §6ter.2 customer view): items, delivery, payment,
 * status timeline, tracking, online payment (monobank, components/account/OrderPayment).
 * Open-chat CTA «Написать в чат».
 * GET /api/me/orders/{id} (queryKey ["me","orders",id]).
 *
 * ChiSetup (v3): a sticky translucent header (back + title + status),
 * stacked `.nb` sections (status + StatusTimeline, items with thumbnails,
 * totals, delivery, payment + tracking, reject banner, the payment block) and
 * a prominent sticky bottom "Написать в чат" button within thumb reach.
 * All data fields, routes and query keys are preserved.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Ban,
  Check,
  Copy,
  CreditCard,
  MapPin,
  MessageCircle,
  Package,
  Receipt,
  Store,
  Truck,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { IN_FLIGHT, OrderPayment } from "@/components/account/OrderPayment";
import { PaymentBadge } from "@/components/account/PaymentBadge";
import { StatusTimeline } from "@/components/account/StatusTimeline";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError, customerApi, type OrderDetail } from "@/lib/api";
import { paymentState } from "@shop/shared";
import { formatDateTime, shortOrderId } from "@/lib/format";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { riseItem, spring, staggerContainer } from "@/lib/motion";
import { useT } from "@/i18n/context";
import { useAccessToken } from "@/lib/auth";
import { haptic } from "@/lib/telegram";

export default function OrderDetailPage() {
  const t = useT();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const token = useAccessToken();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["me", "orders", id],
    queryFn: () => customerApi.getOrder(id),
    // Wait for the Telegram sign-in to produce a token: firing this on mount raced the
    // initData exchange and the 403 that came back was shown as "не удалось загрузить".
    enabled: !!id && !!token,
  });

  return (
    <div className="pt-2">
      {/* sticky header */}
      <header
        className="sticky z-20 -mx-4 mb-4 flex items-center gap-2 border-b border-[var(--line)] px-4 py-3 backdrop-blur-[12px]"
        style={{ top: "var(--safe-top)", background: "rgba(14,14,16,.86)" }}
      >
        <button
          type="button"
          aria-label={t("common.back")}
          onClick={() => {
            haptic();
            router.push("/account");
          }}
          className="tap nb-press -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <h1 className="nb-up flex-1 truncate text-[18px] font-extrabold text-[var(--ink)]">
          {t("inbox.orderNumber", { id: shortOrderId(id) })}
        </h1>
        {data && <StatusChip status={data.status} />}
      </header>

      {(isLoading || !token) && (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-32 rounded-[var(--r-card)]" />
          ))}
        </div>
      )}

      {isError && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="nb hud-frame flex flex-col items-center gap-3 px-6 py-12 text-center"
        >
          <WifiOff className="h-8 w-8 text-[var(--accent)]" strokeWidth={2.25} />
          <p className="text-[14px] text-[var(--muted)]">
            {t("order.error")}
          </p>
          <Button
            variant="accent"
            loading={isRefetching}
            onClick={() => {
              haptic();
              void refetch();
            }}
          >
            {t("common.retry")}
          </Button>
        </motion.div>
      )}

      {data && (
        <OrderBody
          order={data}
          id={id}
          onRefetch={() => void refetch()}
          onOrder={(o) => queryClient.setQueryData(["me", "orders", id], o)}
        />
      )}
    </div>
  );
}

/** The server sends the reject reason code with the order; the shared type does not list it yet. */
type OrderWithReasonCode = OrderDetail & { rejectReasonCode?: string | null };

function OrderBody({
  order,
  id,
  onRefetch,
  onOrder,
}: {
  order: OrderDetail;
  id: string;
  onRefetch: () => void;
  onOrder: (o: OrderDetail) => void;
}) {
  const t = useT();
  const isPickup = order.deliveryMethod === "PICKUP";
  const payState = paymentState(order);
  // The backend refuses to cancel while the bank is charging the card — do not offer it then.
  const cancelable =
    !order.paid &&
    (order.status === "NEW" || order.status === "APPROVED") &&
    !IN_FLIGHT.includes(order.payment.status);
  const paymentTimeout =
    order.status === "REJECTED" &&
    (order as OrderWithReasonCode).rejectReasonCode === "PAYMENT_TIMEOUT";
  const payment = <OrderPayment order={order} onOrder={onOrder} onRefetch={onRefetch} />;

  return (
    <>
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        // leave room for the sticky chat bar (button + safe area)
        className="flex flex-col gap-4 pb-28"
      >
        {/* Payment still due: the action goes first, so it is the first thing seen on arrival. */}
        {payState === "AWAITING" && <motion.div variants={riseItem}>{payment}</motion.div>}

        {/* status + timeline */}
        <motion.section variants={riseItem} className="nb p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="eyebrow flex items-center gap-2 !text-[10px] !tracking-[0.2em]">
              {t("order.status")}
            </h3>
            <PaymentBadge state={payState} />
          </div>
          <StatusTimeline status={order.status} />

          {paymentTimeout ? (
            <div className="mt-3 rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,var(--surface))] px-4 py-3">
              <p className="nb-up text-[13px] font-bold text-[var(--danger)]">{t("pay.timeout")}</p>
            </div>
          ) : order.status === "REJECTED" && order.rejectReason && (
            <div className="mt-3 rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,var(--surface))] px-4 py-3">
              <p className="nb-up text-[11px] font-bold text-[var(--danger)]">
                {t("order.rejectReason")}
              </p>
              <p className="mt-1 text-[14px] text-[var(--ink)]">
                {order.rejectReason}
              </p>
            </div>
          )}

          {order.trackingNumber && (
            <div className="mt-3 flex items-center gap-2 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5">
              <Truck
                className="h-4 w-4 shrink-0 text-[var(--accent)]"
                strokeWidth={2.5}
              />
              <span className="nb-up text-[11px] font-semibold text-[var(--muted)]">
                {t("order.tracking")}
              </span>
              <span className="font-display min-w-0 flex-1 truncate text-[14px] font-bold tabular-nums text-[var(--ink)]">
                {order.trackingNumber}
              </span>
              <CopyButton value={order.trackingNumber} label={t("order.tracking")} />
            </div>
          )}

          <p className="mt-3 text-[12px] text-[var(--faint)]">
            {t("order.createdAt", { when: formatDateTime(order.createdAt) })}
          </p>
        </motion.section>

        {/* items + totals */}
        <motion.section variants={riseItem} className="nb p-4">
          <h3 className="eyebrow flex items-center gap-2 !text-[10px] !tracking-[0.2em] mb-3">
            <Package className="h-4 w-4" strokeWidth={2.25} /> {t("order.items")}
          </h3>
          <div className="flex flex-col gap-3">
            {order.items.map((it, i) => (
              <div key={it.id ?? i} className="flex items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)]">
                  <Image
                    src={it.imageUrl}
                    alt={it.title}
                    size={120}
                    className="h-full w-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[14px] font-semibold text-[var(--ink)]">
                    {it.gift && (
                      <span className="font-display mr-1 inline-block rounded-full bg-[var(--c3)] px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--accent-ink)]">
                        {t("order.giftBadge")}
                      </span>
                    )}
                    {it.title}
                  </p>
                  {it.variantName && (
                    <p className="text-[12px] text-[var(--muted)]">
                      {it.variantName}
                    </p>
                  )}
                  <p className="mt-0.5 text-[12px] font-medium text-[var(--faint)]">
                    {it.gift
                      ? it.quantity > 1
                        ? t("order.giftMany", { n: it.quantity })
                        : t("order.gift")
                      : `${it.quantity} × ${money(it.priceMinor, it.currency ?? order.currency)}`}
                  </p>
                </div>
                <span className="font-display shrink-0 text-[14px] font-bold tabular-nums text-[var(--ink)]">
                  {it.gift
                    ? "0 ₴"
                    : money(it.priceMinor * it.quantity, it.currency ?? order.currency)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-[var(--line)] pt-3">
            <TotalRow
              label={t("order.sum")}
              value={money(order.subtotalMinor, order.currency)}
            />
            {order.discountMinor > 0 && (
              <TotalRow
                label={
                  order.promoCode
                    ? t("order.discountWithCode", { code: order.promoCode })
                    : t("order.discount")
                }
                value={`− ${money(order.discountMinor, order.currency)}`}
                discount
              />
            )}
            <TotalRow
              label={t("order.total")}
              value={money(order.totalMinor, order.currency)}
              strong
            />
          </div>
        </motion.section>

        {/* delivery + payment */}
        <motion.section
          variants={riseItem}
          className="nb flex flex-col gap-4 p-4"
        >
          <InfoRow
            icon={<Receipt className="h-4 w-4" strokeWidth={2.5} />}
            label={t("order.recipient")}
            value={`${order.customerName}, ${order.phone}`}
          />
          <InfoRow
            icon={
              isPickup ? (
                <Store className="h-4 w-4" strokeWidth={2.5} />
              ) : (
                <MapPin className="h-4 w-4" strokeWidth={2.5} />
              )
            }
            label={t("order.delivery")}
            value={
              isPickup
                ? t("order.pickup")
                : t("order.npDelivery", { city: order.npCityName ?? "" }) +
                  (order.npWarehouseName ? `, ${order.npWarehouseName}` : "")
            }
          />
          {order.paymentOptionTitle && (
            <InfoRow
              icon={<CreditCard className="h-4 w-4" strokeWidth={2.5} />}
              label={t("order.payment")}
              value={order.paymentOptionTitle}
            />
          )}
          {order.comment && (
            <InfoRow label={t("order.comment")} value={order.comment} />
          )}
        </motion.section>

        {/* paid: amount, card / Apple Pay, what is left for the courier */}
        {payState !== "AWAITING" && <motion.div variants={riseItem}>{payment}</motion.div>}

        {/* cancel (only while unpaid + NEW/APPROVED) */}
        {cancelable && (
          <motion.section variants={riseItem}>
            <CancelOrder orderId={order.id} onDone={onRefetch} />
          </motion.section>
        )}
      </motion.div>

      {/* sticky chat CTA — within thumb reach, above the TabBar */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-4"
        style={{ bottom: "calc(var(--tabbar-h) + var(--safe-bottom))" }}
      >
        <Link
          href={`/account/orders/${id}/chat`}
          onClick={() => haptic()}
          className="block"
        >
          <Button
            variant="accent"
            fullWidth
            icon={<MessageCircle className="h-4 w-4" strokeWidth={2.5} />}
          >
            {t("order.openChat")}
          </Button>
        </Link>
      </div>
    </>
  );
}

function TotalRow({
  label,
  value,
  strong,
  discount,
}: {
  label: string;
  value: string;
  strong?: boolean;
  discount?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className={
          strong
            ? "nb-up text-[14px] font-bold text-[var(--ink)]"
            : "text-[13px] text-[var(--muted)]"
        }
      >
        {label}
      </span>
      {strong ? (
        <span className="font-display text-[19px] font-bold tabular-nums text-[var(--accent)]">
          {value}
        </span>
      ) : (
        <span
          className={
            discount
              ? "font-display text-[13px] font-bold tabular-nums text-[var(--ok)]"
              : "font-display text-[13px] font-semibold tabular-nums text-[var(--ink)]"
          }
        >
          {value}
        </span>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      {icon && (
        <span className="mt-0.5 shrink-0 text-[var(--accent)]">{icon}</span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          {label}
        </span>
        <span className="break-words text-[14px] text-[var(--ink)]">
          {value}
        </span>
      </div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    haptic();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={t("order.copy", { label })}
      className="tap nb-press flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
    >
      {copied ? (
        <Check className="h-4 w-4 text-[var(--ok)]" strokeWidth={2.75} />
      ) : (
        <Copy className="h-4 w-4 text-[var(--muted)]" strokeWidth={2.5} />
      )}
    </button>
  );
}

/**
 * What the customer sees is translated; what the SELLER receives is always the Russian wording.
 * The cancellation reason lands on the admin board and in a Telegram card, and a board where every
 * third reason is in a different language is harder to scan than it is worth.
 */
const CANCEL_REASONS = [
  { id: "payment", ru: "Проблема с оплатой / картой" },
  { id: "changedMind", ru: "Передумал(а)" },
  { id: "mistake", ru: "Оформил(а) по ошибке" },
  { id: "cheaper", ru: "Нашёл(ла) дешевле" },
  { id: "other", ru: "Другое" },
] as const;

type CancelReasonId = (typeof CANCEL_REASONS)[number]["id"];

/** Cancel an unpaid order with a reason picker (NEW/APPROVED only). */
function CancelOrder({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancelReasonId | null>(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    const finalReason =
      reason === "other"
        ? other.trim()
        : CANCEL_REASONS.find((r) => r.id === reason)?.ru ?? undefined;
    setBusy(true);
    setErr(null);
    try {
      haptic();
      await customerApi.cancelOrder(orderId, finalReason || undefined);
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("cancel.failed"));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          haptic();
          setOpen(true);
        }}
        className="font-display tap nb-press flex w-full items-center justify-center gap-2 rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-transparent py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--danger)]"
      >
        <Ban className="h-4 w-4" strokeWidth={2.25} /> {t("cancel.button")}
      </button>
    );
  }

  const confirmDisabled =
    busy || !reason || (reason === "other" && !other.trim());

  return (
    <div className="nb p-4">
      <h3 className="eyebrow flex items-center gap-2 !text-[10px] !tracking-[0.2em]">
        {t("cancel.title")}
      </h3>
      <div className="mt-3 flex flex-col gap-2">
        {CANCEL_REASONS.map((r) => {
          const on = reason === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                haptic();
                setReason(r.id);
              }}
              className={`tap flex items-center gap-2.5 rounded-[var(--r)] border px-3 py-2.5 text-left text-[13px] font-medium ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
                  : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
              }`}
            >
              <span
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px] ${
                  on ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--line-strong)]"
                }`}
              >
                {on && (
                  <Check className="h-2.5 w-2.5 text-[var(--accent-ink)]" strokeWidth={4} />
                )}
              </span>
              {t(`cancel.reason.${r.id}`)}
            </button>
          );
        })}
      </div>
      {reason === "other" && (
        <textarea
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder={t("cancel.otherPlaceholder")}
          rows={2}
          className="mt-2 w-full resize-none rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />
      )}
      {err && (
        <p className="mt-2 text-[12px] font-bold text-[var(--danger)]">{err}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-display tap nb-press flex-1 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] py-2.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--ink)]"
        >
          {t("common.back")}
        </button>
        <button
          type="button"
          disabled={confirmDisabled}
          onClick={confirm}
          className="font-display tap nb-press flex-1 rounded-[var(--r)] py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-white disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          {busy ? "…" : t("cancel.button")}
        </button>
      </div>
    </div>
  );
}
