"use client";

import { motion } from "framer-motion";
import { Package } from "lucide-react";
import { payableMinor } from "@shop/core/orders";
import { CasePrizeNote } from "@/features/gift";
import { useT } from "@/i18n/context";
import type { OrderDetail } from "@/lib/api";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { riseItem } from "@/lib/motion";

type Item = OrderDetail["items"][number];

/** The gift badge before the title: an automatic gift (case prize) or a hand-added one. */
function GiftBadge({ it }: { it: Item }) {
  const t = useT();
  if (!it.gift && !it.autoGift) return null;
  return (
    <span className="font-display mr-1 inline-block rounded-full bg-[var(--c3)] px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--accent-ink)]">
      {it.autoGift ? t("case.giftLine") : t("order.giftBadge")}
    </span>
  );
}

/** "N × price", or the gift wording for a gift line. */
function QtyLine({ it, currency }: { it: Item; currency: string }) {
  const t = useT();
  const isGift = !!(it.gift || it.autoGift);
  let text = `${it.quantity} × ${money(it.priceMinor, currency)}`;
  if (isGift) text = it.quantity > 1 ? t("order.giftMany", { n: it.quantity }) : t("order.gift");
  return <p className="mt-0.5 text-[12px] font-medium text-[var(--faint)]">{text}</p>;
}

/** The variant name, or the "choose a size" prompt while the gift size is still pending. */
function VariantLine({ it }: { it: Item }) {
  const t = useT();
  if (it.variantPending) {
    return <p className="text-[12px] font-semibold text-[var(--accent-hi)]">{t("case.size.choose")}</p>;
  }
  return it.variantName ? <p className="text-[12px] text-[var(--muted)]">{it.variantName}</p> : null;
}

/** One line: thumbnail, title with gift badge, quantity × price, partial-pickup note. */
function OrderItemRow({ it, order }: { it: Item; order: OrderDetail }) {
  const t = useT();
  // Partial pickup: the units refused at the post office (on their way back, or back already).
  const pending = it.returnPendingQty ?? 0;
  const back = (order.uncollectedMinor ?? 0) > 0 ? (it.returnedQty ?? 0) + pending : 0;
  const isGift = !!(it.gift || it.autoGift);
  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)]">
        <Image src={it.imageUrl} alt={it.title} size={120} className="h-full w-full" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[14px] font-semibold text-[var(--ink)]">
          <GiftBadge it={it} />
          {it.title}
        </p>
        <VariantLine it={it} />
        {it.autoGift && it.caseRarity && <CasePrizeNote rarity={it.caseRarity} />}
        <QtyLine it={it} currency={order.currency} />
        {back > 0 && (
          <p className="mt-0.5 text-[12px] font-semibold text-[var(--danger)]">
            {t(pending > 0 ? "order.item.uncollectedBack" : "order.item.uncollected", {
              n: back < it.quantity ? ` ${back}/${it.quantity}` : "",
            })}
          </p>
        )}
      </div>
      <span
        className={`font-display shrink-0 text-[14px] font-bold tabular-nums ${
          back >= it.quantity ? "text-[var(--faint)] line-through" : "text-[var(--ink)]"
        }`}
      >
        {isGift ? "0 ₴" : money(it.priceMinor * it.quantity, order.currency)}
      </span>
    </div>
  );
}

/** Sum, discount, then either total or total / uncollected / payable. */
function OrderTotals({ order }: { order: OrderDetail }) {
  const t = useT();
  const uncollected = order.uncollectedMinor ?? 0;
  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-[var(--line)] pt-3">
      <TotalRow label={t("order.sum")} value={money(order.subtotalMinor, order.currency)} />
      {order.discountMinor > 0 && (
        <TotalRow
          label={order.promoCode ? t("order.discountWithCode", { code: order.promoCode }) : t("order.discount")}
          value={`− ${money(order.discountMinor, order.currency)}`}
          discount
        />
      )}
      {uncollected > 0 ? (
        <>
          <TotalRow label={t("order.total")} value={money(order.totalMinor, order.currency)} />
          <TotalRow label={t("order.uncollected")} value={`− ${money(uncollected, order.currency)}`} danger />
          <TotalRow label={t("order.payable")} value={money(payableMinor(order), order.currency)} strong />
        </>
      ) : (
        <TotalRow label={t("order.total")} value={money(order.totalMinor, order.currency)} strong />
      )}
    </div>
  );
}

/** Items with thumbnails + the totals (sum, discount, uncollected, payable). */
export function OrderItemsCard({ order }: { order: OrderDetail }) {
  const t = useT();
  return (
    <motion.section variants={riseItem} className="nb p-4">
      <h3 className="eyebrow flex items-center gap-2 !text-[10px] !tracking-[0.2em] mb-3">
        <Package className="h-4 w-4" strokeWidth={2.25} /> {t("order.items")}
      </h3>
      <div className="flex flex-col gap-3">
        {order.items.map((it, i) => (
          <OrderItemRow key={it.id ?? i} it={it} order={order} />
        ))}
      </div>
      <OrderTotals order={order} />
    </motion.section>
  );
}

function TotalRow({
  label,
  value,
  strong,
  discount,
  danger,
}: {
  label: string;
  value: string;
  strong?: boolean;
  discount?: boolean;
  danger?: boolean;
}) {
  let valueClass = "font-display text-[13px] font-semibold tabular-nums text-[var(--ink)]";
  if (discount) valueClass = "font-display text-[13px] font-bold tabular-nums text-[var(--ok)]";
  else if (danger) valueClass = "font-display text-[13px] font-bold tabular-nums text-[var(--danger)]";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "nb-up text-[14px] font-bold text-[var(--ink)]" : "text-[13px] text-[var(--muted)]"}>
        {label}
      </span>
      {strong ? (
        <span className="font-display text-[19px] font-bold tabular-nums text-[var(--accent)]">{value}</span>
      ) : (
        <span className={valueClass}>{value}</span>
      )}
    </div>
  );
}
