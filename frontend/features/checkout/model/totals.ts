import type { LooseT } from "@shop/core/i18n";
import type { GiftProgress, GiftTierInfo } from "@shop/core/giftcase";
import type { DeliveryMethod, NpWarehouse } from "@/lib/api";

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
