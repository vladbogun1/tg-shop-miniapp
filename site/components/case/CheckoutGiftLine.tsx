"use client";

/** The gift line in the checkout summary (the gift for the order sum is reached): a case or the gift product, free. */
import type { GiftProgress } from "@shop/core/giftcase";
import { caseTierAsset } from "@shop/ui/gift-case";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";

export function CheckoutGiftLine({ gift, currency }: { gift: GiftProgress; currency: string }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const product = gift.kind === "CASE" ? null : gift.product;
  return (
    <li className="flex items-center gap-3">
      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--r)] border border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[var(--surface-2)]">
        {!product ? (
          <img src={caseTierAsset("/case", gift.tier?.tier ?? null, "case-closed-sm.webp")} alt="" className="h-full w-full object-contain p-0.5" />
        ) : (
          <Image
            src={product.images?.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0]?.url ?? null}
            alt=""
            size={120}
            className="h-full w-full"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        {!product ? (
          <span className="line-clamp-2 text-[13px] font-bold text-[var(--ink)]">{gift.tier ? t(`case.tier.${gift.tier.tier}` as MessageKey) : t("case.line")}</span>
        ) : (
          <>
            <span className="block text-[12px] font-bold text-[var(--ok)]">{t("case.gift.line")}</span>
            <span className="line-clamp-2 text-[13px] font-medium text-[var(--ink)]">{product.title}</span>
          </>
        )}
      </span>
      <span className="shrink-0 font-display text-[13px] font-bold text-[var(--ok)]">
        {gift.kind === "CASE" ? fmt.money(0, currency) : t("case.gift.free")}
      </span>
    </li>
  );
}
