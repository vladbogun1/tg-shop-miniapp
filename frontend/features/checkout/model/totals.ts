import type { LooseT } from "@shop/core/i18n";
import type { GiftProgress, GiftTierInfo } from "@shop/core/giftcase";
/** Шаг можно пройти: 0 — получатель и телефон, 1 — доставка (`deliveryOk` из @shop/customer/delivery/draft), 2 — оплата. */
export function stepIsValid(step: number, v: { recipientOk: boolean; phoneOk: boolean; deliveryOk: boolean; paid: boolean }): boolean {
  const ok = [v.recipientOk && v.phoneOk, v.deliveryOk, v.paid, true];
  return ok[step] ?? false;
}

/** Шаг с полем, которое отклонил сервер: получатель и телефон — 0, адрес и комментарий — 1. */
export function stepOfField(field: "name" | "phone" | "comment" | "address"): number {
  return field === "name" || field === "phone" ? 0 : 1;
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
