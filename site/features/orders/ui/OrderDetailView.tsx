"use client";

/**
 * Order page (vinli-style): tiles Доставка / Оплата / Адрес, the status timeline, TTN, items with
 * totals, the online payment block (monobank: pay / checking / paid / cancelled for non-payment —
 * see features/payment), cancellation (unpaid: at once; paid: a request the shop
 * approves with a refund or declines; shipped: the returns page — shared `customerCancelMode`) and
 * the order chat at the bottom. `?created=1` (from the checkout) shows the "order created" step. Data and rules are the Mini App's (frontend/app/account/orders/[id]).
 */
import { orderKeys } from "@shop/customer/order/keys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { customerCancelMode, paymentState } from "@shop/core/orders";
import { shortOrderId } from "@shop/core/format";
import { type OrderDetail } from "@shop/core/types";
import { OrderChat } from "@/components/chat/OrderChat";
import { isPaymentTimeout, OrderPayment } from "@/features/payment";
import { OrderReceipts } from "./Receipts";
import { Button, StatusChip } from "@shop/ui/primitives";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { api, ApiError } from "@/lib/api";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";
import { PaymentBadge } from "./PaymentBadge";
import { StatusTimeline } from "./StatusTimeline";
import { Cancellation } from "./Cancellation";
import { OrderItemsCard } from "./OrderItemsCard";
import { OrderTiles } from "./OrderTiles";
import { OrderReviewCta } from "@/components/reviews/OrderReviewCta";
import { useOrderGiftCase } from "@/components/case/OrderGiftCase";

export function OrderDetailView({ id }: { id: string }) {
  const { t, href, locale } = useI18n();
  const { data, isLoading, isError, error, refetch } = useQuery({
    // Line titles are translated per language — keep one entry per locale.
    queryKey: orderKeys.detail(id, locale),
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
  const uncollected = Math.max(0, order.uncollectedMinor ?? 0);
  const cancelMode = customerCancelMode(order);
  // Gift case (V57): the case card on top (locked until paid), the opening screen (once).
  const giftCase = useOrderGiftCase(order);
  const refresh = () => {
    onChange();
    void qc.invalidateQueries({ queryKey: orderKeys.list() });
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
        <StatusChip status={order.status} label={t(`status.${order.status}`)} />
        <PaymentBadge state={paymentState(order)} />
      </div>
      <p className="-mt-3 text-[13px] font-semibold text-[var(--muted)]">
        {t("order.createdAt", { when: fmt.dateTime(order.createdAt) })}
      </p>

      {giftCase.card}
      {giftCase.overlay}

      {/* payment comes first: while it is due, it is the one thing to do on this page */}
      <OrderPayment
        order={order}
        onRefetch={refresh}
        created={created}
        onCancel={cancelMode === "CANCEL" ? openCancel : undefined}
      />

      <OrderReceipts order={order} />

      <OrderReviewCta orderId={order.id} status={order.status} />

      <OrderTiles order={order} uncollected={uncollected} />

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

      <OrderItemsCard order={order} uncollected={uncollected} />

      <div ref={cancelRef}>
        <Cancellation order={order} mode={cancelMode} open={cancelOpen} setOpen={setCancelOpen} onDone={refresh} />
      </div>

      <OrderChat orderId={order.id} />
    </div>
  );
}
