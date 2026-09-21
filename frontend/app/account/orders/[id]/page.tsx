"use client";

/**
 * ORDER DETAIL (design doc §6ter.2 customer view): items, delivery, payment,
 * status timeline, tracking, requisites. Open-chat CTA «Написать в чат».
 * GET /api/me/orders/{id} (queryKey ["me","orders",id]).
 *
 * NEO-BRUTALISM restyle: a sticky ink-bordered header (back + title + status),
 * stacked `.nb` sections (status + StatusTimeline, items with thumbnails,
 * totals, delivery, payment + tracking, reject banner, copyable requisites) and
 * a prominent sticky bottom "Написать в чат" button within thumb reach.
 * All data fields, routes and query keys are preserved.
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  MapPin,
  MessageCircle,
  Package,
  Receipt,
  Store,
  Truck,
  Upload,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { StatusTimeline } from "@/components/account/StatusTimeline";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  ApiError,
  customerApi,
  type OrderDetail,
  type PaymentRequisites,
} from "@/lib/api";
import { paymentState, type PaymentState } from "@shop/shared";
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

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["me", "orders", id],
    queryFn: () => customerApi.getOrder(id),
    // Wait for the Telegram sign-in to produce a token: firing this on mount raced the
    // initData exchange and the 403 that came back was shown as "не удалось загрузить".
    enabled: !!id && !!token,
  });

  return (
    <div className="pt-2">
      {/* sticky ink header */}
      <header
        className="sticky z-20 -mx-4 mb-4 flex items-center gap-2 border-b-[3px] border-[var(--line)] bg-[var(--bg)] px-4 py-3"
        style={{ top: "var(--safe-top)" }}
      >
        <button
          type="button"
          aria-label={t("common.back")}
          onClick={() => {
            haptic();
            router.push("/account");
          }}
          className="tap nb-flat nb-press -ml-1 flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--surface)] text-[var(--ink)]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.75} />
        </button>
        <h1 className="nb-up flex-1 truncate text-[18px] font-black text-[var(--ink)]">
          {t("inbox.orderNumber", { id: shortOrderId(id) })}
        </h1>
        {data && <StatusChip status={data.status} />}
      </header>

      {(isLoading || !token) && (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-32 rounded-[var(--r)]" />
          ))}
        </div>
      )}

      {isError && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="nb flex flex-col items-center gap-3 px-6 py-12 text-center"
        >
          <WifiOff className="h-8 w-8 text-[var(--muted)]" strokeWidth={2.5} />
          <p className="text-[14px] font-semibold text-[var(--muted)]">
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

      {data && <OrderBody order={data} id={id} onPaid={() => void refetch()} />}
    </div>
  );
}

function OrderBody({
  order,
  id,
  onPaid,
}: {
  order: OrderDetail;
  id: string;
  onPaid: () => void;
}) {
  const t = useT();
  const isPickup = order.deliveryMethod === "PICKUP";
  const cancelable =
    !order.paid && (order.status === "NEW" || order.status === "APPROVED");

  return (
    <>
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        // leave room for the sticky chat bar (button + safe area)
        className="flex flex-col gap-4 pb-28"
      >
        {/* status + timeline */}
        <motion.section variants={riseItem} className="nb p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="nb-up text-[12px] font-black text-[var(--faint)]">
              {t("order.status")}
            </h3>
            <PaidBadge state={paymentState(order)} />
          </div>
          <StatusTimeline status={order.status} />

          {order.status === "REJECTED" && order.rejectReason && (
            <div className="mt-3 border-[3px] border-[var(--line)] bg-[color-mix(in_srgb,var(--danger)_16%,var(--surface))] px-4 py-3">
              <p className="nb-up text-[11px] font-black text-[var(--danger)]">
                {t("order.rejectReason")}
              </p>
              <p className="mt-1 text-[14px] font-semibold text-[var(--ink)]">
                {order.rejectReason}
              </p>
            </div>
          )}

          {order.trackingNumber && (
            <div className="mt-3 flex items-center gap-2 border-[3px] border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5">
              <Truck
                className="h-4 w-4 shrink-0 text-[var(--accent)]"
                strokeWidth={2.5}
              />
              <span className="nb-up text-[11px] font-bold text-[var(--muted)]">
                {t("order.tracking")}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-black text-[var(--ink)]">
                {order.trackingNumber}
              </span>
              <CopyButton value={order.trackingNumber} label={t("order.tracking")} />
            </div>
          )}

          <p className="mt-3 text-[12px] font-semibold text-[var(--faint)]">
            {t("order.createdAt", { when: formatDateTime(order.createdAt) })}
          </p>
        </motion.section>

        {/* items + totals */}
        <motion.section variants={riseItem} className="nb p-4">
          <h3 className="nb-up mb-3 flex items-center gap-2 text-[12px] font-black text-[var(--faint)]">
            <Package className="h-4 w-4" strokeWidth={2.5} /> {t("order.items")}
          </h3>
          <div className="flex flex-col gap-3">
            {order.items.map((it, i) => (
              <div key={it.id ?? i} className="flex items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden border-[2.5px] border-[var(--line)]">
                  <Image
                    src={it.imageUrl}
                    alt={it.title}
                    size={120}
                    className="h-full w-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[14px] font-bold text-[var(--ink)]">
                    {it.gift && (
                      <span className="mr-1 inline-block rounded-[var(--r)] border-2 border-[var(--line)] bg-[var(--c3)] px-1.5 py-0.5 align-middle text-[10px] font-black uppercase text-[var(--accent-ink)]">
                        {t("order.giftBadge")}
                      </span>
                    )}
                    {it.title}
                  </p>
                  {it.variantName && (
                    <p className="text-[12px] font-semibold text-[var(--muted)]">
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
                <span className="shrink-0 text-[14px] font-black text-[var(--ink)]">
                  {it.gift
                    ? "0 ₴"
                    : money(it.priceMinor * it.quantity, it.currency ?? order.currency)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t-[3px] border-[var(--line)] pt-3">
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

        {/* requisites */}
        {order.requisites && hasAnyRequisite(order.requisites) && (
          <motion.section variants={riseItem} className="nb p-4">
            <h3 className="nb-up mb-3 flex items-center gap-2 text-[12px] font-black text-[var(--faint)]">
              <CreditCard className="h-4 w-4" strokeWidth={2.5} />{" "}
              {t("order.requisitesTitle")}
            </h3>
            <div className="flex flex-col gap-3">
              {order.requisites.cardNumber && (
                <CopyRow label={t("order.requisites.card")} value={order.requisites.cardNumber} />
              )}
              {order.requisites.iban && (
                <CopyRow label="IBAN" value={order.requisites.iban} />
              )}
              {order.requisites.recipient && (
                <InfoRow label={t("order.recipient")} value={order.requisites.recipient} />
              )}
              {order.requisites.edrpou && (
                <CopyRow label={t("order.requisites.edrpou")} value={order.requisites.edrpou} />
              )}
              {order.requisites.purpose && (
                <InfoRow label={t("order.requisites.purpose")} value={order.requisites.purpose} />
              )}
              {order.requisites.note && (
                <InfoRow label={t("order.requisites.note")} value={order.requisites.note} />
              )}
            </div>
          </motion.section>
        )}

        {/* payment: confirmed / awaiting confirmation / upload a receipt */}
        <motion.section variants={riseItem}>
          {order.paid ? (
            <div className="nb flex items-center gap-2 bg-[var(--c4)] p-4">
              <CheckCircle2
                className="h-5 w-5 shrink-0 text-[var(--accent-ink)]"
                strokeWidth={2.75}
              />
              <span className="nb-up text-[14px] font-black text-[var(--accent-ink)]">
                {t("order.paymentConfirmed")}
              </span>
            </div>
          ) : order.paymentClaimed ? (
            <div className="nb flex items-start gap-2 bg-[var(--c3)] p-4">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--ink)]" strokeWidth={2.75} />
              <div>
                <span className="nb-up block text-[14px] font-black text-[var(--ink)]">
                  {t("order.paymentClaimed")}
                </span>
                <p className="mt-1 text-[12px] font-semibold text-[var(--ink)]">
                  {t("order.paymentClaimedText")}
                </p>
              </div>
            </div>
          ) : (
            <PaymentProof orderId={order.id} onPaid={onPaid} />
          )}
        </motion.section>

        {/* cancel (only while unpaid + NEW/APPROVED) */}
        {cancelable && (
          <motion.section variants={riseItem}>
            <CancelOrder orderId={order.id} onDone={onPaid} />
          </motion.section>
        )}
      </motion.div>

      {/* sticky chat CTA — within thumb reach, above the TabBar */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-4"
        style={{ bottom: "calc(84px + var(--safe-bottom))" }}
      >
        <Link
          href={`/account/orders/${id}/chat`}
          onClick={() => haptic()}
          className="block"
        >
          <Button
            variant="accent"
            fullWidth
            icon={<MessageCircle className="h-4 w-4" strokeWidth={2.75} />}
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
            ? "nb-up text-[14px] font-black text-[var(--ink)]"
            : "text-[13px] font-semibold text-[var(--muted)]"
        }
      >
        {label}
      </span>
      {strong ? (
        <span className="border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[16px] font-black text-[var(--ink)]">
          {value}
        </span>
      ) : (
        <span
          className={
            discount
              ? "text-[13px] font-black text-[var(--ok)]"
              : "text-[13px] font-bold text-[var(--ink)]"
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
        <span className="nb-up text-[11px] font-bold text-[var(--faint)]">
          {label}
        </span>
        <span className="break-words text-[14px] font-semibold text-[var(--ink)]">
          {value}
        </span>
      </div>
    </div>
  );
}

/** InfoRow with a copy-to-clipboard action (card/IBAN/edrpou). */
function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="nb-up text-[11px] font-bold text-[var(--faint)]">
          {label}
        </span>
        <span className="break-words text-[14px] font-black text-[var(--ink)]">
          {value}
        </span>
      </div>
      <CopyButton value={value} label={label} />
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
      className="tap nb-flat nb-press flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--surface)] text-[var(--ink)]"
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
 * Payment badge. "Оплата на проверке" is its own state on purpose: uploading a screenshot is a
 * claim, and showing it as «ОПЛАЧЕН» is what let an unpaid order look settled.
 */
function PaidBadge({ state }: { state: PaymentState }) {
  const t = useT();
  if (state === "PAID") {
    return (
      <span className="nb-up flex shrink-0 items-center gap-1 border-[2.5px] border-[var(--line)] bg-[var(--c4)] px-2 py-0.5 text-[11px] font-black text-[var(--accent-ink)]">
        <Check className="h-3 w-3" strokeWidth={3} />
        {t("payment.paid")}
      </span>
    );
  }
  if (state === "PARTIAL" || state === "CLAIMED") {
    return (
      <span className="nb-up flex shrink-0 items-center gap-1 border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[11px] font-black text-[var(--ink)]">
        <Clock className="h-3 w-3" strokeWidth={3} />
        {state === "PARTIAL" ? t("payment.partial") : t("payment.claimed")}
      </span>
    );
  }
  return (
    <span className="nb-up shrink-0 border-[2.5px] border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-black text-[var(--muted)]">
      {t("payment.unpaid")}
    </span>
  );
}

/**
 * Upload a transfer screenshot.
 *
 * The screenshot goes into the order chat and flags the order as "payment claimed" — it does NOT
 * mark it paid. Only an admin who sees the money confirms it, so the cash-on-delivery amount on
 * the seller's dispatch card stays correct until then.
 */
function PaymentProof({
  orderId,
  onPaid,
}: {
  orderId: string;
  onPaid: () => void;
}) {
  const t = useT();
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setState("uploading");
    setErr(null);
    try {
      const { url } = await customerApi.uploadAttachment(file);
      await customerApi.submitPaymentProof(orderId, {
        type: "PHOTO",
        attachmentUrl: url,
        fileName: file.name,
        mimeType: file.type,
      });
      haptic();
      setState("idle");
      onPaid();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("order.proof.failed"));
      setState("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="nb p-4 text-left">
      <h3 className="nb-up flex items-center gap-2 text-[12px] font-black text-[var(--faint)]">
        <Upload className="h-4 w-4" strokeWidth={2.5} /> {t("order.proof.title")}
      </h3>
      <p className="mt-1 mb-3 text-[12px] font-medium text-[var(--muted)]">
        {t("order.proof.text")}
      </p>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFile} />
      <Button
        variant="accent"
        fullWidth
        loading={state === "uploading"}
        icon={<Upload className="h-4 w-4" strokeWidth={2.75} />}
        onClick={() => inputRef.current?.click()}
      >
        {t("order.proof.upload")}
      </Button>
      {err && (
        <p className="mt-2 text-[12px] font-bold text-[var(--danger)]">{err}</p>
      )}
    </div>
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
        className="tap nb-flat nb-press flex w-full items-center justify-center gap-2 py-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--danger)]"
        style={{ borderColor: "var(--danger)" }}
      >
        <Ban className="h-4 w-4" strokeWidth={2.75} /> {t("cancel.button")}
      </button>
    );
  }

  const confirmDisabled =
    busy || !reason || (reason === "other" && !other.trim());

  return (
    <div className="nb p-4">
      <h3 className="nb-up text-[12px] font-black text-[var(--faint)]">
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
              className={`tap flex items-center gap-2.5 border-[2.5px] border-[var(--line)] px-3 py-2.5 text-left text-[13px] font-bold ${
                on
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "bg-[var(--surface)] text-[var(--ink)]"
              }`}
            >
              <span
                className={`grid h-4 w-4 shrink-0 place-items-center border-[2px] border-[var(--line)] ${
                  on ? "bg-[var(--accent-ink)]" : ""
                }`}
              >
                {on && (
                  <Check className="h-3 w-3 text-[var(--accent)]" strokeWidth={3} />
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
          className="mt-2 w-full resize-none border-[2.5px] border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[14px] font-semibold text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]"
        />
      )}
      {err && (
        <p className="mt-2 text-[12px] font-bold text-[var(--danger)]">{err}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="tap nb-flat nb-press flex-1 py-2.5 text-[13px] font-extrabold uppercase text-[var(--ink)]"
        >
          {t("common.back")}
        </button>
        <button
          type="button"
          disabled={confirmDisabled}
          onClick={confirm}
          className="tap nb-press flex-1 border-[3px] border-[var(--line)] py-2.5 text-[13px] font-black uppercase text-white shadow-[4px_4px_0_var(--shadow)] disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          {busy ? "…" : t("cancel.button")}
        </button>
      </div>
    </div>
  );
}

function hasAnyRequisite(r: PaymentRequisites): boolean {
  return Boolean(
    r.cardNumber || r.iban || r.recipient || r.edrpou || r.purpose || r.note
  );
}
