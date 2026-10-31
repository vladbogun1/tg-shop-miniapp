import type { LooseT } from "@shop/core/i18n";
import type { GiftProgress, GiftTierInfo } from "@shop/core/giftcase";
import type { DeliveryMethod, NpWarehouse, PaymentOption } from "@/lib/api";

/**
 * The chosen option among the visible ones. A prepayment option is hidden when the whole order
 * costs no more than the prepayment: if the customer had picked one and the total then dropped
 * (promo, quantity), the choice moves to the first full-payment option.
 */
export function resolvePayment(options: PaymentOption[], paymentId: string | null): PaymentOption | null {
  return (
    options.find((p) => p.id === paymentId) ??
    (paymentId ? options.find((p) => !p.requiresPrepayment) ?? null : null)
  );
}

/** What the customer pays right now: the prepayment for prepay options, otherwise the full total. */
export function dueNowOf(chosen: PaymentOption | null, total: number): number {
  return chosen?.requiresPrepayment && chosen.prepaymentMinor ? Math.min(chosen.prepaymentMinor, total) : total;
}

export function stepIsValid(
  step: number,
  v: { nameOk: boolean; phoneOk: boolean; delivery: DeliveryMethod; warehouse: NpWarehouse | null; paid: boolean },
): boolean {
  const ok = [
    v.nameOk && v.phoneOk,
    v.delivery === "PICKUP" || (v.delivery === "NOVA_POSHTA" && !!v.warehouse),
    v.paid,
    true,
  ];
  return ok[step];
}

export interface ConfirmGift {
  title: string;
  isCase?: boolean;
  tier?: GiftTierInfo["tier"] | null;
}

/** The gift line of the summary (null: no gift, or the customer took the guaranteed discount instead). */
export function confirmGiftLine(
  gift: GiftProgress | null,
  giftTier: GiftTierInfo | null,
  giftDiscount: number,
  t: LooseT,
): ConfirmGift | null {
  if (!gift) return null;
  if (gift.kind === "CASE" || !gift.product) {
    if (giftDiscount > 0) return null;
    return { title: giftTier ? t(`case.tier.${giftTier.tier}`) : t("case.line"), isCase: true, tier: giftTier?.tier ?? null };
  }
  return { title: gift.product.title };
}
