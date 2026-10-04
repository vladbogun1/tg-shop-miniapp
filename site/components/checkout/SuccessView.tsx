"use client";

/**
 * "Order placed" screen: order number, requisites (from CreateOrderResponse, kept by the checkout;
 * otherwise read from the order), copy buttons, screenshot upload, link to the order chat, and a
 * note that the bot will message them.
 */
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle, Package, Send } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { shortOrderId } from "@shop/shared";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { hasAnyRequisite, PaymentClaimed, PaymentConfirmed, PaymentProof, RequisitesCard } from "@/components/order/Payment";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/use-fmt";
import { readSuccess, type SuccessInfo } from "./success-store";
import { noFadeFlash } from "@/lib/motion";

export function SuccessView({ orderId }: { orderId: string }) {
  const { t, href, locale } = useI18n();
  const fmt = useFmt();
  const [info, setInfo] = useState<SuccessInfo | null>(null);
  useEffect(() => setInfo(readSuccess(orderId)), [orderId]);

  const order = useQuery({
    queryKey: ["me", "orders", orderId, locale],
    queryFn: () => api.order(orderId),
  });
  const o = order.data;
  const requisites = info?.requisites ?? o?.requisites ?? null;
  const total = o?.totalMinor ?? info?.totalMinor;
  const dueNow =
    info?.dueNowMinor ??
    (o && o.prepaymentMinor > 0 ? Math.min(o.prepaymentMinor, o.totalMinor) : o?.totalMinor);
  const currency = o?.currency ?? info?.currency ?? "UAH";

  return (
    <div className="container-site max-w-3xl pt-10">
      <div className="nb hud-frame flex flex-col items-center px-5 py-9 text-center sm:px-10">
        <motion.div
          {...noFadeFlash}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 22 }}
          className="chamfer grid h-20 w-20 place-items-center bg-[var(--accent-soft)] [--chamfer:14px]"
        >
          <CheckCircle2 className="h-11 w-11 text-[var(--accent)] [filter:drop-shadow(0_0_10px_rgba(255,102,0,.6))]" strokeWidth={1.75} />
        </motion.div>
        <h1 className="mt-5 font-display text-[28px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[38px]">
          {t("success.title")}
        </h1>
        <p className="mt-1 text-[15px] font-semibold text-[var(--muted)]">
          {t("success.orderNumber")} <span className="font-display font-bold tracking-[.04em] text-[var(--accent-hi)]">{shortOrderId(orderId)}</span>
          {total != null && <> · {fmt.money(total, currency)}</>}
        </p>
        <p className="mt-4 flex max-w-md items-start gap-2 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-left text-[13px] font-medium text-[var(--ink)]">
          <Send className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.25} />
          {t("success.botNote")}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-5">
        {hasAnyRequisite(requisites) ? (
          <RequisitesCard
            requisites={requisites}
            title={t("success.requisites")}
            lead={t("success.payByRequisites")}
            amount={dueNow != null ? fmt.money(dueNow, currency) : undefined}
          />
        ) : (
          (info || o) && <p className="nb p-5 text-[14px] font-semibold text-[var(--muted)]">{t("success.noRequisites")}</p>
        )}

        {o?.paid ? (
          <PaymentConfirmed />
        ) : o?.paymentClaimed ? (
          <PaymentClaimed />
        ) : (
          hasAnyRequisite(requisites) && <PaymentProof orderId={orderId} onDone={() => void order.refetch()} />
        )}
        {hasAnyRequisite(requisites) && !o?.paid && !o?.paymentClaimed && (
          <p className="eyebrow text-center text-[11px]">{t("success.payLater")}</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <ButtonLink href={href(`/account/orders/${orderId}`)} variant="accent" fullWidth icon={<Package className="h-4 w-4" strokeWidth={2.25} />}>
            {t("success.openOrder")}
          </ButtonLink>
          <ButtonLink href={href(`/account/orders/${orderId}#chat`)} variant="surface" fullWidth icon={<MessageCircle className="h-4 w-4" strokeWidth={2.25} />}>
            {t("success.openChat")}
          </ButtonLink>
        </div>
        <ButtonLink href={href("/catalog")} variant="ghost" fullWidth>
          {t("common.toCatalog")}
        </ButtonLink>
      </div>
    </div>
  );
}
