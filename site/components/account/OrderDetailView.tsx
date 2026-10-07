"use client";

/**
 * Order page (vinli-style): tiles Доставка / Оплата / Адрес, the status timeline, TTN, items with
 * totals, the online payment block (monobank: pay / checking / paid / cancelled for non-payment —
 * see components/order/Payment.tsx), cancellation (unpaid: at once; paid: a request the shop
 * approves with a refund or declines; shipped: the returns page — shared `customerCancelMode`) and
 * the order chat at the bottom. `?created=1` (from the checkout) shows the "order created" step. Data and rules are the Mini App's (frontend/app/account/orders/[id]).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Check, CheckCircle2, Clock, CreditCard, MapPin, MessageCircle, RotateCcw, Store, Truck, WifiOff, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CANCEL_REASON_MAX, customerCancelMode, paymentState, shortOrderId, type OrderDetail } from "@shop/shared";
import { OrderChat } from "@/components/chat/OrderChat";
import { isPaymentTimeout, OrderPayment } from "@/components/order/Payment";
import { OrderReceipts } from "@/components/order/Receipts";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { StatusChip } from "@/components/ui/StatusChip";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { api, ApiError } from "@/lib/api";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";
import { PaymentBadge } from "./PaymentBadge";
import { StatusTimeline } from "./StatusTimeline";
import { OrderReviewCta } from "@/components/reviews/OrderReviewCta";

export function OrderDetailView({ id }: { id: string }) {
  const { t, href, locale } = useI18n();
  const { data, isLoading, isError, error, refetch } = useQuery({
    // Line titles are translated per language — keep one entry per locale.
    queryKey: ["me", "orders", id, locale],
    queryFn: () => api.order(id),
  });

  // A link to the order with #chat — scroll there once the page has content.
  useEffect(() => {
    if (data && window.location.hash === "#chat") {
      document.getElementById("chat")?.scrollIntoView({ block: "start" });
    }
  }, [data]);

  return (
    <div>
      <Link href={href("/account")} className="mb-4 inline-flex items-center gap-1.5 font-display text-[13px] font-semibold uppercase tracking-[.08em] text-[var(--muted)] transition-colors hover:text-[var(--accent-hi)]">
        <ArrowLeft className="h-4 w-4" strokeWidth={2.5} /> {t("order.back")}
      </Link>
      {isLoading && (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-32" />
          ))}
        </div>
      )}
      {isError && (
        <div className="nb flex flex-col items-start gap-3 p-6">
          <WifiOff className="h-7 w-7 text-[var(--muted)]" strokeWidth={2.5} />
          <p className="text-[15px] font-medium text-[var(--muted)]">
            {error instanceof ApiError && error.status === 404 ? t("order.notFound") : t("order.error")}
          </p>
          <Button variant="accent" size="sm" onClick={() => void refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      )}
      {data && <OrderBody order={data} onChange={() => void refetch()} />}
    </div>
  );
}

function OrderBody({ order, onChange }: { order: OrderDetail; onChange: () => void }) {
  const { t, href } = useI18n();
  const fmt = useFmt();
  const qc = useQueryClient();
  const router = useRouter();
  const isPickup = order.deliveryMethod === "PICKUP";
  const cancelMode = customerCancelMode(order);
  const refresh = () => {
    onChange();
    void qc.invalidateQueries({ queryKey: ["me", "orders"] });
  };

  // `?created=1` — just placed: the payment block becomes the "order created" step. Read once and
  // dropped from the address bar (a reload shows the plain order page).
  const [created, setCreated] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("created") === "1") {
      setCreated(true);
      router.replace(href(`/account/orders/${order.id}`), { scroll: false });
    }
  }, [order.id, router, href]);

  const [cancelOpen, setCancelOpen] = useState(false);
  const cancelRef = useRef<HTMLDivElement>(null);
  function openCancel() {
    setCancelOpen(true);
    window.setTimeout(() => cancelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[24px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[28px]">
          {t("order.title", { id: shortOrderId(order.id) })}
        </h2>
        <StatusChip status={order.status} />
        <PaymentBadge state={paymentState(order)} />
      </div>
      <p className="-mt-3 text-[13px] font-semibold text-[var(--muted)]">
        {t("order.createdAt", { when: fmt.dateTime(order.createdAt) })}
      </p>

      {/* payment comes first: while it is due, it is the one thing to do on this page */}
      <OrderPayment
        order={order}
        onRefetch={refresh}
        created={created}
        onCancel={cancelMode === "CANCEL" ? openCancel : undefined}
      />

      <OrderReceipts order={order} />

      <OrderReviewCta orderId={order.id} status={order.status} />

      {/* tiles */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
        <Tile icon={isPickup ? <Store className="h-5 w-5" /> : <Truck className="h-5 w-5" />} label={t("order.delivery")}>
          {isPickup ? t("order.pickup") : t("order.np")}
          {order.trackingNumber && (
            <span className="mt-2 flex items-center gap-2">
              <span className="text-[12px] font-medium text-[var(--muted)]">{t("order.tracking")}</span>
              <span className="min-w-0 flex-1 truncate font-display text-[15px] font-bold tracking-[.04em] text-[var(--accent-hi)]">{order.trackingNumber}</span>
              <CopyButton value={order.trackingNumber} label={t("order.tracking")} />
            </span>
          )}
        </Tile>
        <Tile icon={<CreditCard className="h-5 w-5" />} label={t("order.payment")}>
          {order.paymentOptionTitle ?? "—"}
          <span className="mt-1 block text-[13px] font-semibold text-[var(--muted)]">
            {t("order.total")}: {fmt.money(order.totalMinor, order.currency)}
          </span>
        </Tile>
        <Tile icon={<MapPin className="h-5 w-5" />} label={t("order.address")}>
          {isPickup ? t("order.pickup") : [order.npCityName, order.npWarehouseName].filter(Boolean).join(", ") || "—"}
          <span className="mt-1 block text-[13px] font-semibold text-[var(--muted)]">
            {order.customerName}, {order.phone}
          </span>
        </Tile>
      </div>

      <section className="nb p-5">
        <h3 className="eyebrow mb-4 text-[11px]">{t("order.status")}</h3>
        <StatusTimeline order={order} />
        {order.status === "REJECTED" && order.rejectReason && !isPaymentTimeout(order) && (
          <div className="mt-4 rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,var(--surface))] px-4 py-3">
            <p className="nb-up text-[11px] font-semibold text-[var(--danger)]">{t("order.rejectReason")}</p>
            <p className="mt-1 text-[14px] font-semibold text-[var(--ink)]">{order.rejectReason}</p>
          </div>
        )}
      </section>

      <section className="nb p-5">
        <h3 className="eyebrow mb-4 text-[11px]">{t("order.items")}</h3>
        <ul className="flex flex-col gap-3">
          {order.items.map((it, i) => (
            <li key={it.id ?? i} className="flex items-center gap-3">
              <span className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]">
                <Image src={it.imageUrl} alt={it.title} size={140} className="h-full w-full" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[14px] font-semibold text-[var(--ink)]">
                  {it.gift && (
                    <span className="mr-1 inline-block rounded-full bg-[var(--accent-soft)] px-2 py-0.5 align-middle font-display text-[10px] font-bold uppercase tracking-[.06em] text-[var(--accent-hi)]">
                      {t("order.giftBadge")}
                    </span>
                  )}
                  {it.title}
                </p>
                {it.variantName && <p className="text-[12px] font-semibold text-[var(--muted)]">{it.variantName}</p>}
                <p className="text-[12px] font-medium text-[var(--faint)]">
                  {it.gift
                    ? it.quantity > 1
                      ? t("order.giftMany", { n: it.quantity })
                      : t("order.gift")
                    : `${it.quantity} × ${fmt.money(it.priceMinor, it.currency ?? order.currency)}`}
                </p>
              </div>
              <span className="shrink-0 font-display text-[15px] font-bold tabular-nums text-[var(--ink)]">
                {fmt.money(it.gift ? 0 : it.priceMinor * it.quantity, it.currency ?? order.currency)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-1.5 border-t border-[var(--line)] pt-3 text-[14px]">
          <div className="flex justify-between font-semibold text-[var(--muted)]">
            <span>{t("order.sum")}</span>
            <span className="font-semibold text-[var(--ink)]">{fmt.money(order.subtotalMinor, order.currency)}</span>
          </div>
          {order.discountMinor > 0 && (
            <div className="flex justify-between font-semibold text-[var(--muted)]">
              <span>{order.promoCode ? t("order.discountWithCode", { code: order.promoCode }) : t("order.discount")}</span>
              <span className="font-display font-bold tabular-nums text-[var(--ok)]">−{fmt.money(order.discountMinor, order.currency)}</span>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between">
            <span className="font-display text-[15px] font-bold uppercase tracking-[.06em] text-[var(--ink)]">{t("order.total")}</span>
            <span className="font-display text-[18px] font-bold tabular-nums text-[var(--accent)]">
              {fmt.money(order.totalMinor, order.currency)}
            </span>
          </div>
        </div>
        {order.comment && (
          <p className="mt-4 text-[13px] font-semibold text-[var(--muted)]">
            {t("order.comment")}: <span className="text-[var(--ink)]">{order.comment}</span>
          </p>
        )}
      </section>

      <div ref={cancelRef}>
        <Cancellation order={order} mode={cancelMode} open={cancelOpen} setOpen={setCancelOpen} onDone={refresh} />
      </div>

      <OrderChat orderId={order.id} />
    </div>
  );
}

function Tile({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="nb p-4">
      <p className="eyebrow mb-2 flex items-center gap-2 text-[11px]">
        <span className="text-[var(--accent)]">{icon}</span> {label}
      </p>
      <div className="break-words text-[15px] font-semibold text-[var(--ink)]">{children}</div>
    </div>
  );
}

/** What the seller receives is always Russian (see the Mini App); the buyer sees a translation. */
const CANCEL_REASONS = [
  { id: "payment", ru: "Проблема с оплатой / картой" },
  { id: "changedMind", ru: "Передумал(а)" },
  { id: "mistake", ru: "Оформил(а) по ошибке" },
  { id: "cheaper", ru: "Нашёл(ла) дешевле" },
  { id: "other", ru: "Другое" },
] as const;

type CancelReasonId = (typeof CANCEL_REASONS)[number]["id"];

type CancelMode = ReturnType<typeof customerCancelMode>;

/**
 * Everything about cancelling, per `customerCancelMode`: the unpaid cancel dialog (reason picker),
 * the request form for a paid order, the request's state, the "bank is processing" hint and, once
 * shipped, the returns link.
 */
function Cancellation({
  order,
  mode,
  open,
  setOpen,
  onDone,
}: {
  order: OrderDetail;
  mode: CancelMode;
  open: boolean;
  setOpen: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t, href } = useI18n();
  const fmt = useFmt();

  switch (mode) {
    case "CANCEL":
      return open ? (
        <CancelOrder orderId={order.id} onClose={() => setOpen(false)} onDone={onDone} />
      ) : (
        <DangerButton onClick={() => setOpen(true)} icon={<Ban className="h-4 w-4" strokeWidth={2.25} />}>
          {t("cancel.button")}
        </DangerButton>
      );
    case "REQUEST":
      return open ? (
        <RequestCancel orderId={order.id} onClose={() => setOpen(false)} onDone={onDone} />
      ) : (
        <DangerButton onClick={() => setOpen(true)} icon={<Ban className="h-4 w-4" strokeWidth={2.25} />}>
          {t("cancel.request.button")}
        </DangerButton>
      );
    case "PROCESSING":
      return (
        <div className="flex flex-col items-start gap-2">
          <DangerButton disabled icon={<Ban className="h-4 w-4" strokeWidth={2.25} />}>
            {t("cancel.button")}
          </DangerButton>
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--muted)]">
            <Clock className="h-4 w-4 shrink-0" strokeWidth={2.25} /> {t("cancel.processing")}
          </p>
        </div>
      );
    case "PENDING":
      return (
        <StateCard tone="warn" icon={<Clock className="h-5 w-5" strokeWidth={2} />} title={t("cancel.request.pending.title")}>
          <p>{t("cancel.request.pending.text")}</p>
          {order.cancelRequestReason && (
            <p className="mt-2 text-[var(--muted)]">
              {t("cancel.request.yourReason")}: <span className="text-[var(--ink)]">{order.cancelRequestReason}</span>
              {order.cancelRequestedAt && <span className="text-[var(--faint)]"> · {fmt.dateTime(order.cancelRequestedAt)}</span>}
            </p>
          )}
        </StateCard>
      );
    case "DECLINED":
      return (
        <StateCard tone="danger" icon={<XCircle className="h-5 w-5" strokeWidth={2} />} title={t("cancel.request.declined.title")}>
          {order.cancelRequestAdminComment && (
            <p>
              {t("cancel.request.shopComment")}: <span className="font-semibold">{order.cancelRequestAdminComment}</span>
            </p>
          )}
          <p className="mt-2 text-[var(--muted)]">{t("cancel.request.declined.text")}</p>
          <a
            href="#chat"
            className="mt-3 inline-flex min-h-11 items-center gap-2 font-display text-[13px] font-bold uppercase tracking-[.06em] text-[var(--accent-hi)]"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={2.25} /> {t("cancel.toChat")}
          </a>
        </StateCard>
      );
    case "APPROVED":
      return (
        <StateCard tone="ok" icon={<CheckCircle2 className="h-5 w-5" strokeWidth={2} />} title={t("cancel.request.approved.title")}>
          <p>{t("cancel.request.approved.text")}</p>
        </StateCard>
      );
    case "RETURNS":
      return (
        <div className="flex flex-col gap-2 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-[13px] font-medium text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>{t("cancel.returns.text")}</p>
          <Link
            href={href("/returns")}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 font-display text-[13px] font-bold uppercase tracking-[.06em] text-[var(--accent-hi)]"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2.25} /> {t("cancel.returns.link")}
          </Link>
        </div>
      );
    default:
      return null;
  }
}

function DangerButton({
  children,
  icon,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 items-center justify-center gap-2 self-start rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_55%,transparent)] bg-transparent px-4 font-display text-[13px] font-bold uppercase tracking-[.06em] text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      {icon} {children}
    </button>
  );
}

const STATE_TONE = { ok: "var(--ok)", warn: "var(--warn)", danger: "var(--danger)" } as const;

function StateCard({
  tone,
  icon,
  title,
  children,
}: {
  tone: keyof typeof STATE_TONE;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const c = STATE_TONE[tone];
  return (
    <section
      className="nb flex items-start gap-3 p-5"
      style={{ borderColor: `color-mix(in srgb, ${c} 45%, transparent)`, background: `color-mix(in srgb, ${c} 8%, var(--surface))` }}
      aria-live="polite"
    >
      <span className="mt-0.5 shrink-0" style={{ color: c }}>
        {icon}
      </span>
      <div className="min-w-0 text-[14px] font-medium text-[var(--ink)]">
        <p className="mb-1 font-display text-[15px] font-bold uppercase tracking-[.06em]" style={{ color: c }}>
          {title}
        </p>
        {children}
      </div>
    </section>
  );
}

function CancelOrder({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState<CancelReasonId | null>(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    const finalReason = reason === "other" ? other.trim() : CANCEL_REASONS.find((r) => r.id === reason)?.ru;
    setBusy(true);
    setErr(null);
    try {
      await api.cancelOrder(orderId, finalReason || undefined);
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("cancel.failed"));
      setBusy(false);
      // Paid meanwhile (PAID_NEEDS_REQUEST) or the bank is busy: reload so the right state shows.
      if (e instanceof ApiError && e.code) onDone();
    }
  }

  return (
    <section className="nb max-w-xl p-5">
      <h3 className="eyebrow text-[11px]">{t("cancel.reasonOptional")}</h3>
      <div role="radiogroup" aria-label={t("cancel.title")} className="mt-3 flex flex-col gap-2">
        {CANCEL_REASONS.map((r) => {
          const on = reason === r.id;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setReason(on ? null : r.id)}
              className={`flex min-h-11 items-center gap-2.5 rounded-[var(--r)] border px-3 text-left text-[14px] font-medium transition-colors ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
                  : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--line-strong)]"
              }`}
            >
              <span
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${on ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--line-strong)]"}`}
              >
                {on && <Check className="h-3 w-3 text-[var(--accent-ink)]" strokeWidth={2.75} />}
              </span>
              {t(`cancel.reason.${r.id}` as MessageKey)}
            </button>
          );
        })}
      </div>
      {reason === "other" && (
        <textarea
          value={other}
          onChange={(e) => setOther(e.target.value.slice(0, CANCEL_REASON_MAX))}
          placeholder={t("cancel.otherPlaceholder")}
          aria-label={t("cancel.otherPlaceholder")}
          rows={2}
          className="mt-2 w-full resize-none rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        />
      )}
      {err && (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-[var(--danger)]">
          {err}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="surface" onClick={onClose}>
          {t("common.back")}
        </Button>
        <button
          type="button"
          disabled={busy || (reason === "other" && !other.trim())}
          onClick={() => void confirm()}
          className="min-h-[48px] flex-1 rounded-[var(--r)] px-4 font-display text-[14px] font-bold uppercase tracking-[.06em] text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          {busy ? "…" : t("cancel.confirm")}
        </button>
      </div>
    </section>
  );
}

/** Paid order: the reason is required and goes to the shop as typed. */
function RequestCancel({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await api.requestCancel(orderId, reason.trim());
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("cancel.request.failed"));
      setBusy(false);
      if (e instanceof ApiError && e.code) onDone();
    }
  }

  return (
    <section className="nb max-w-xl p-5">
      <h3 className="eyebrow text-[11px]">{t("cancel.request.title")}</h3>
      <p className="mt-2 text-[13px] font-medium text-[var(--muted)]">{t("cancel.request.text")}</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, CANCEL_REASON_MAX))}
        placeholder={t("cancel.request.placeholder")}
        aria-label={t("cancel.request.placeholder")}
        rows={3}
        maxLength={CANCEL_REASON_MAX}
        className="mt-3 w-full resize-none rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
      />
      <p className="text-right text-[11px] font-medium tabular-nums text-[var(--faint)]">
        {reason.length}/{CANCEL_REASON_MAX}
      </p>
      {err && (
        <p role="alert" className="mt-1 text-[12px] font-semibold text-[var(--danger)]">
          {err}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="surface" onClick={onClose}>
          {t("common.back")}
        </Button>
        <button
          type="button"
          disabled={busy || !reason.trim()}
          onClick={() => void send()}
          className="min-h-[48px] flex-1 rounded-[var(--r)] px-4 font-display text-[14px] font-bold uppercase tracking-[.06em] text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          {busy ? "…" : t("cancel.request.send")}
        </button>
      </div>
    </section>
  );
}
