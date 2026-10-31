"use client";

import { payableMinor } from "@shop/core/orders";
import { type OrderDetail } from "@shop/core/types";
import { CasePrizeNote } from "@/components/case/OrderGiftCase";
import { useI18n } from "@/i18n/context";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";

/** The items of an order with the money summary (sum, promo, partial pickup, payable). */
export function OrderItemsCard({ order, uncollected }: { order: OrderDetail; uncollected: number }) {
  const { t } = useI18n();
  const fmt = useFmt();
  return (
  <section className="nb p-5">
    <h3 className="eyebrow mb-4 text-[11px]">{t("order.items")}</h3>
      <ul className="flex flex-col gap-3">
        {order.items.map((it, i) => (
          <ItemRow key={it.id ?? i} it={it} order={order} uncollected={uncollected} />
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
      {uncollected > 0 && (
        <>
          <div className="flex justify-between font-semibold text-[var(--muted)]">
            <span>{t("order.total")}</span>
            <span className="font-semibold text-[var(--ink)]">{fmt.money(order.totalMinor, order.currency)}</span>
          </div>
          <div className="flex justify-between font-semibold text-[var(--muted)]">
            <span>{t("order.uncollected")}</span>
            <span className="font-display font-bold tabular-nums text-[var(--danger)]">−{fmt.money(uncollected, order.currency)}</span>
          </div>
        </>
      )}
      <div className="mt-1 flex items-center justify-between">
        <span className="font-display text-[15px] font-bold uppercase tracking-[.06em] text-[var(--ink)]">
          {uncollected > 0 ? t("order.payable") : t("order.total")}
        </span>
        <span className="font-display text-[18px] font-bold tabular-nums text-[var(--accent)]">
          {fmt.money(payableMinor(order), order.currency)}
        </span>
      </div>
    </div>
    {order.comment && (
      <p className="mt-4 text-[13px] font-semibold text-[var(--muted)]">
        {t("order.comment")}: <span className="text-[var(--ink)]">{order.comment}</span>
      </p>
    )}
  </section>
  );
}

function ItemRow({ it, order, uncollected }: { it: OrderDetail["items"][number]; order: OrderDetail; uncollected: number }) {
  const { t } = useI18n();
  const fmt = useFmt();
  // Partial pickup: the units refused at the post office (on their way back, or back already).
  const pending = it.returnPendingQty ?? 0;
  const back = uncollected > 0 ? (it.returnedQty ?? 0) + pending : 0;
  return (
      <li className="flex items-center gap-3">
        <span className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]">
          <Image src={it.imageUrl} alt={it.title} size={140} className="h-full w-full" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[14px] font-semibold text-[var(--ink)]">
            {(it.gift || it.autoGift) && (
              <span className="mr-1 inline-block rounded-full bg-[var(--accent-soft)] px-2 py-0.5 align-middle font-display text-[10px] font-bold uppercase tracking-[.06em] text-[var(--accent-hi)]">
                {it.autoGift ? t("case.gift.line") : t("order.giftBadge")}
              </span>
            )}
            {it.title}
          </p>
          <ItemNotes it={it} order={order} back={back} pending={pending} />
        </div>
        <span
          className={`shrink-0 font-display text-[15px] font-bold tabular-nums ${
            back >= it.quantity ? "text-[var(--faint)] line-through" : "text-[var(--ink)]"
          }`}
        >
          {fmt.money(it.gift || it.autoGift ? 0 : it.priceMinor * it.quantity, order.currency)}
        </span>
      </li>
  );
}

type Item = OrderDetail["items"][number];

function ItemNotes({ it, order, back, pending }: { it: Item; order: OrderDetail; back: number; pending: number }) {
  const { t } = useI18n();
  const fmt = useFmt();
  return (
    <>
    {it.variantPending ? (
      <p className="text-[12px] font-semibold text-[var(--accent-hi)]">{t("case.size.choose")}</p>
    ) : (
      it.variantName && <p className="text-[12px] font-semibold text-[var(--muted)]">{it.variantName}</p>
    )}
    {it.autoGift && it.caseRarity && <CasePrizeNote rarity={it.caseRarity} />}
    <p className="text-[12px] font-medium text-[var(--faint)]">
      {it.gift || it.autoGift
        ? it.quantity > 1
          ? t("order.giftMany", { n: it.quantity })
          : t("order.gift")
        : `${it.quantity} × ${fmt.money(it.priceMinor, order.currency)}`}
    </p>
    {back > 0 && (
      <p className="text-[12px] font-semibold text-[var(--danger)]">
        {t(pending > 0 ? "order.item.uncollectedBack" : "order.item.uncollected", {
          n: back < it.quantity ? ` ${back}/${it.quantity}` : "",
        })}
      </p>
    )}
    </>
  );
}
