"use client";

/**
 * Order page (vinli-style): tiles Доставка / Оплата / Адрес, the status timeline, TTN, items with
 * totals, requisites + screenshot upload while unpaid, cancel (NEW/APPROVED and unpaid) and the
 * order chat at the bottom. Data and rules are the Mini App's (frontend/app/account/orders/[id]).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Check, CreditCard, MapPin, Store, Truck, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { paymentState, shortOrderId, type OrderDetail } from "@shop/shared";
import { OrderChat } from "@/components/chat/OrderChat";
import { CopyButton, hasAnyRequisite, PaymentClaimed, PaymentConfirmed, PaymentProof, RequisitesCard } from "@/components/order/Payment";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { api, ApiError } from "@/lib/api";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";
import { PaymentBadge } from "./PaymentBadge";
import { StatusTimeline } from "./StatusTimeline";

export function OrderDetailView({ id }: { id: string }) {
  const { t, href } = useI18n();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["me", "orders", id],
    queryFn: () => api.order(id),
  });

  // Coming from the success page with #chat — scroll there once the page has content.
  useEffect(() => {
    if (data && window.location.hash === "#chat") {
      document.getElementById("chat")?.scrollIntoView({ block: "start" });
    }
  }, [data]);

  return (
    <div>
      <Link href={href("/account")} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-black uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)]">
        <ArrowLeft className="h-4 w-4" strokeWidth={3} /> {t("order.back")}
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
          <p className="text-[15px] font-bold text-[var(--muted)]">
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
  const { t } = useI18n();
  const fmt = useFmt();
  const qc = useQueryClient();
  const isPickup = order.deliveryMethod === "PICKUP";
  const cancelable = !order.paid && (order.status === "NEW" || order.status === "APPROVED");
  const showPay = !order.paid && order.status !== "REJECTED";
  const refresh = () => {
    onChange();
    void qc.invalidateQueries({ queryKey: ["me", "orders"] });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[24px] font-black uppercase tracking-tight text-[var(--ink)] sm:text-[28px]">
          {t("order.title", { id: shortOrderId(order.id) })}
        </h2>
        <StatusChip status={order.status} />
        <PaymentBadge state={paymentState(order)} />
      </div>
      <p className="-mt-3 text-[13px] font-semibold text-[var(--muted)]">
        {t("order.createdAt", { when: fmt.dateTime(order.createdAt) })}
      </p>

      {/* tiles */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
        <Tile icon={isPickup ? <Store className="h-5 w-5" /> : <Truck className="h-5 w-5" />} label={t("order.delivery")}>
          {isPickup ? t("order.pickup") : t("order.np")}
          {order.trackingNumber && (
            <span className="mt-2 flex items-center gap-2">
              <span className="text-[12px] font-bold text-[var(--muted)]">{t("order.tracking")}</span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-black">{order.trackingNumber}</span>
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
        <h3 className="nb-up mb-4 text-[12px] font-black text-[var(--faint)]">{t("order.status")}</h3>
        <StatusTimeline order={order} />
        {order.status === "REJECTED" && order.rejectReason && (
          <div className="mt-4 border-[3px] border-[var(--line)] bg-[color-mix(in_srgb,var(--danger)_16%,var(--surface))] px-4 py-3">
            <p className="nb-up text-[11px] font-black text-[var(--danger)]">{t("order.rejectReason")}</p>
            <p className="mt-1 text-[14px] font-semibold text-[var(--ink)]">{order.rejectReason}</p>
          </div>
        )}
      </section>

      <section className="nb p-5">
        <h3 className="nb-up mb-4 text-[12px] font-black text-[var(--faint)]">{t("order.items")}</h3>
        <ul className="flex flex-col gap-3">
          {order.items.map((it, i) => (
            <li key={it.id ?? i} className="flex items-center gap-3">
              <span className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--r)] border-[2.5px] border-[var(--line)]">
                <Image src={it.imageUrl} alt={it.title} size={140} className="h-full w-full" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[14px] font-bold text-[var(--ink)]">
                  {it.gift && (
                    <span className="mr-1 inline-block border-2 border-[var(--line)] bg-[var(--c3)] px-1.5 align-middle text-[10px] font-black uppercase text-[var(--accent-ink)]">
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
              <span className="shrink-0 text-[15px] font-black text-[var(--ink)]">
                {fmt.money(it.gift ? 0 : it.priceMinor * it.quantity, it.currency ?? order.currency)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-1.5 border-t-[3px] border-[var(--line)] pt-3 text-[14px]">
          <div className="flex justify-between font-semibold text-[var(--muted)]">
            <span>{t("order.sum")}</span>
            <span className="font-bold text-[var(--ink)]">{fmt.money(order.subtotalMinor, order.currency)}</span>
          </div>
          {order.discountMinor > 0 && (
            <div className="flex justify-between font-semibold text-[var(--muted)]">
              <span>{order.promoCode ? t("order.discountWithCode", { code: order.promoCode }) : t("order.discount")}</span>
              <span className="font-black text-[var(--ok)]">−{fmt.money(order.discountMinor, order.currency)}</span>
            </div>
          )}
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[15px] font-black uppercase text-[var(--ink)]">{t("order.total")}</span>
            <span className="border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[18px] font-black text-[var(--accent-ink)]">
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

      {order.paid ? (
        <PaymentConfirmed />
      ) : (
        showPay && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
            {hasAnyRequisite(order.requisites) && <RequisitesCard requisites={order.requisites} />}
            {order.paymentClaimed ? <PaymentClaimed /> : <PaymentProof orderId={order.id} onDone={refresh} />}
          </div>
        )
      )}

      {cancelable && <CancelOrder orderId={order.id} onDone={refresh} />}

      <OrderChat orderId={order.id} />
    </div>
  );
}

function Tile({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="nb p-4">
      <p className="nb-up mb-2 flex items-center gap-2 text-[12px] font-black text-[var(--faint)]">
        <span className="text-[var(--accent)]">{icon}</span> {label}
      </p>
      <div className="break-words text-[15px] font-extrabold text-[var(--ink)]">{children}</div>
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

function CancelOrder({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
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
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center justify-center gap-2 self-start rounded-[var(--r)] border-[3px] border-[var(--danger)] bg-[var(--surface)] px-4 text-[13px] font-extrabold uppercase tracking-wide text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white"
      >
        <Ban className="h-4 w-4" strokeWidth={2.75} /> {t("cancel.button")}
      </button>
    );
  }

  return (
    <section className="nb max-w-xl p-5">
      <h3 className="nb-up text-[12px] font-black text-[var(--faint)]">{t("cancel.title")}</h3>
      <div role="radiogroup" aria-label={t("cancel.title")} className="mt-3 flex flex-col gap-2">
        {CANCEL_REASONS.map((r) => {
          const on = reason === r.id;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setReason(r.id)}
              className={`flex min-h-11 items-center gap-2.5 border-[2.5px] border-[var(--line)] px-3 text-left text-[14px] font-bold ${
                on ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <span className={`grid h-4 w-4 shrink-0 place-items-center border-[2px] border-[var(--line)] ${on ? "bg-[var(--accent-ink)]" : ""}`}>
                {on && <Check className="h-3 w-3 text-[var(--accent)]" strokeWidth={3} />}
              </span>
              {t(`cancel.reason.${r.id}` as MessageKey)}
            </button>
          );
        })}
      </div>
      {reason === "other" && (
        <textarea
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder={t("cancel.otherPlaceholder")}
          aria-label={t("cancel.otherPlaceholder")}
          rows={2}
          className="mt-2 w-full resize-none border-[2.5px] border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[14px] font-semibold text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        />
      )}
      {err && <p className="mt-2 text-[12px] font-bold text-[var(--danger)]">{err}</p>}
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="surface" onClick={() => setOpen(false)}>
          {t("common.back")}
        </Button>
        <button
          type="button"
          disabled={busy || !reason || (reason === "other" && !other.trim())}
          onClick={() => void confirm()}
          className="min-h-[48px] flex-1 border-[3px] border-[var(--line)] px-4 text-[14px] font-black uppercase text-white shadow-[4px_4px_0_var(--shadow)] disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          {busy ? "…" : t("cancel.button")}
        </button>
      </div>
    </section>
  );
}
