"use client";

/** Orders list — status chips, payment state, totals, unread chat badge. */
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessageCircle, PackageOpen } from "lucide-react";
import Link from "next/link";
import { paymentState, shortOrderId, type OrderSummary } from "@shop/shared";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/use-fmt";
import { PaymentBadge } from "./PaymentBadge";

export function OrdersList() {
  const { t, href } = useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["me", "orders"],
    queryFn: () => api.orders(),
  });
  const orders = (data ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="shimmer h-24" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="nb flex flex-col items-start gap-3 p-6">
        <p className="text-[15px] font-semibold text-[var(--danger)]">{t("account.orders.error")}</p>
        <Button variant="accent" size="sm" onClick={() => void refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  if (orders.length === 0) {
    return (
      <div className="nb hud-frame flex flex-col items-center gap-3 px-6 py-14 text-center">
        <PackageOpen className="h-10 w-10 text-[var(--accent)]" strokeWidth={1.75} />
        <p className="font-display text-[18px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">{t("account.orders.empty.title")}</p>
        <p className="text-[14px] font-medium text-[var(--muted)]">{t("account.orders.empty.text")}</p>
        <Link href={href("/catalog")} className="nb-accent nb-press tap nb-up mt-2 px-5 py-3 text-[14px]">
          {t("common.toCatalog")}
        </Link>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {orders.map((o) => (
        <OrderRow key={o.id} order={o} />
      ))}
    </ul>
  );
}

function OrderRow({ order }: { order: OrderSummary }) {
  const { t, href } = useI18n();
  const fmt = useFmt();
  return (
    <li>
      <Link
        href={href(`/account/orders/${order.id}`)}
        className="nb nb-hover flex flex-wrap items-center gap-x-5 gap-y-3 p-4 sm:flex-nowrap"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[16px] font-bold tracking-[.02em] text-[var(--ink)]">
              {t("account.orders.number", { id: shortOrderId(order.id) })}
            </span>
            <StatusChip status={order.status} />
            <PaymentBadge state={paymentState(order)} />
          </div>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            {fmt.date(order.createdAt)} · {t("account.orders.items", { n: order.itemsCount })}
          </p>
        </div>
        {order.unreadCount > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-2.5 py-1 font-display text-[12px] font-bold text-[var(--accent-ink)]">
            <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
            {t("account.orders.unread", { n: order.unreadCount })}
          </span>
        )}
        <span className="font-display text-[16px] font-bold tabular-nums text-[var(--accent)]">
          {fmt.money(order.totalMinor, order.currency)}
        </span>
        <ChevronRight className="hidden h-5 w-5 text-[var(--muted)] sm:block" strokeWidth={2.5} aria-hidden />
      </Link>
    </li>
  );
}
