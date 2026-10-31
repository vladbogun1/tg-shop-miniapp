"use client";

/** Под составом: приз кейса, который не строка заказа (промокод на скидку, замена товара кодом), и пометки подарка. */
import { CASE_TIER_METAL, caseDiscountText } from "@shop/core/giftcase";
import { formatDateTime } from "@shop/core/time";
import { money } from "@/lib/money";
import { CASE_RARITY_LABEL, CASE_TIER_LABEL } from "@/features/gift";
import type { ReactNode } from "react";
import type { AdminOrderDetail } from "../../api";

type Gift = NonNullable<AdminOrderDetail["gift"]>;
type TieredGift = Gift & { tier: NonNullable<Gift["tier"]> };

function CaseRow({ gift, title, children }: { gift: TieredGift; title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <img src={`/case/${gift.tier.toLowerCase()}/case-closed-sm.webp`} alt="" className="h-12 w-12 shrink-0 object-contain" />
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        <div className="font-semibold" style={{ color: CASE_TIER_METAL[gift.tier].ga }}>
          {title}
        </div>
        <div className="text-[12px] text-[var(--text-faint)]">{children}</div>
      </div>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <div className="text-[12px] text-[var(--text-faint)]">{children}</div>;
}

function promoTitle(gift: TieredGift, currency: string): string {
  if (gift.swap?.swappedAt) return `приз «${gift.prize?.title ?? "товар"}» заменён`;
  const discount = `скидка ${caseDiscountText(gift.prize!, (m) => money(m, currency))}`;
  return gift.prize ? `${discount} · ${CASE_RARITY_LABEL[gift.prize.rarity]}` : discount;
}

function promoValidity(promo: NonNullable<Gift["promo"]>): string {
  if (promo.used) return " · использован";
  return promo.expiresAt ? ` · до ${formatDateTime(promo.expiresAt)}` : "";
}

/** Скидка выпала, а промокод ещё не выдан: что с ним будет. */
function pendingPromoText(order: AdminOrderDetail, gift: Gift): string {
  if (order.status === "REJECTED") return "заказ отклонён — промокод не будет выдан";
  if (gift.caseStatus !== "SEALED") return "промокод на следующий заказ ещё не выдан";
  return `промокод на следующий заказ выдадим, когда покупатель откроет кейс${gift.openable ? " (уже можно)" : " — после оплаты"}`;
}

function PromoPrize({ order, gift, promo }: { order: AdminOrderDetail; gift: TieredGift; promo: NonNullable<Gift["promo"]> }) {
  return (
    <CaseRow gift={gift} title={`${CASE_TIER_LABEL[gift.tier]} кейс · ${promoTitle(gift, order.currency)}`}>
      промокод <span className="font-mono font-semibold text-[var(--text)]">{promo.code}</span>
      {promoValidity(promo)}
    </CaseRow>
  );
}

function PendingDiscountPrize({ order, gift }: { order: AdminOrderDetail; gift: TieredGift }) {
  const prize = gift.prize!;
  return (
    <CaseRow
      gift={gift}
      title={`${CASE_TIER_LABEL[gift.tier]} кейс · выпала скидка ${caseDiscountText(prize, (m) => money(m, order.currency))} · ${CASE_RARITY_LABEL[prize.rarity]}`}
    >
      {pendingPromoText(order, gift)}
    </CaseRow>
  );
}

/** A case prize that is not an order line: a discount code, or a product prize swapped for a code. */
function casePromoOf(gift: Gift): Gift["promo"] | null {
  return gift.promo && (gift.prize?.kind === "DISCOUNT" || gift.swap?.swappedAt) ? gift.promo : null;
}

function GiftHints({ gift, giftDiscount }: { gift: TieredGift; giftDiscount: number }) {
  return (
    <>
      {gift.caseStatus && gift.lowMargin && (
        <Hint>🎯 Кейс разыгран с упором на скидки: в заказе товар с низкой маржой («Подарок → Упор на скидки»).</Hint>
      )}
      {giftDiscount > 0 && !gift.caseStatus && (
        <Hint>
          🎁 Покупатель выбрал гарантированную скидку вместо {CASE_TIER_LABEL[gift.tier].toLowerCase().replace(/ый$/, "ого")} кейса.
        </Hint>
      )}
    </>
  );
}

export function CaseGiftNotes({ order }: { order: AdminOrderDetail }) {
  const gift = order.gift ?? null;
  if (!gift?.tier) return null;
  const tiered = gift as TieredGift;
  const casePromo = casePromoOf(gift);
  return (
    <>
      {casePromo && <PromoPrize order={order} gift={tiered} promo={casePromo} />}
      {gift.prize?.kind === "DISCOUNT" && !casePromo && <PendingDiscountPrize order={order} gift={tiered} />}
      <GiftHints gift={tiered} giftDiscount={order.giftDiscountMinor ?? 0} />
    </>
  );
}
