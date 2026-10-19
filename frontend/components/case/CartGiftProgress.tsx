"use client";

/**
 * Cart: progress to the gift for the order sum, or the gift that is already earned (docs/GIFT-CASE.md).
 * Independent of «Разом дешевше». `totalMinor` = the cart total after the discount. CASE mode:
 * «Купіть ще на N ₴ — і отримаєте кейс з дропом» / the celebratory «🎉 Вітаємо! …» with a glowing
 * case, the rarest prize teaser and an expandable «Що може випасти».
 */
import { motion } from "framer-motion";
import { Gift } from "lucide-react";
import { giftProgress, rarestCasePrize } from "@shop/shared";
import { GiftCaseArt, GiftCasePrizeDisclosure, GiftCasePrizeRows } from "@shop/shared/case-ui";
import { caseImage, useCaseRarityNames } from "@/components/case/OrderGiftCase";
import { useI18n, useT } from "@/i18n/context";
import { useGift } from "@/lib/gift";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { spring } from "@/lib/motion";

export function CartGiftProgress({ totalMinor, currency }: { totalMinor: number; currency: string }) {
  const t = useT();
  const { locale } = useI18n();
  const rarity = useCaseRarityNames();
  const gift = giftProgress(useGift(), totalMinor);
  if (!gift) return null;
  const isCase = gift.kind === "CASE";
  if (isCase ? !gift.caseItems?.length : !gift.product) return null;
  const done = gift.reached;
  const share = gift.thresholdMinor > 0 ? Math.min(1, Math.max(0, 1 - gift.remainingMinor / gift.thresholdMinor)) : 1;
  const rarest = isCase ? rarestCasePrize(gift.caseItems) : null;
  return (
    <div className={`nb mt-4 p-3 ${isCase && done ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)]" : ""}`}>
      <div className="flex items-center gap-3">
        {isCase ? (
          <GiftCaseArt glow={done} className="h-12 w-[72px]" />
        ) : (
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)]">
            <Image src={gift.product!.images?.[0]?.url} alt={gift.product!.title} size={120} className="h-full w-full" />
            <span className="absolute -bottom-px -right-px grid h-5 w-5 place-items-center rounded-tl-[6px] bg-[var(--accent)] text-[var(--accent-ink)]">
              <Gift className="h-3 w-3" strokeWidth={2.75} />
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          {done ? (
            <>
              <p className={`text-[13px] font-semibold leading-snug ${isCase ? "text-[var(--accent-hi)]" : "text-[var(--ink)]"}`}>
                {isCase ? t("case.reached") : <>🎁 {t("case.giftReached", { title: gift.product!.title })}</>}
              </p>
              {rarest && <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-[var(--muted)]">{t("case.teaser", { title: rarest.title })}</p>}
            </>
          ) : (
            <>
              <p className="text-[13px] font-semibold leading-snug text-[var(--ink)]">
                {isCase
                  ? t("case.progress", { amount: money(gift.remainingMinor, currency) })
                  : t("case.giftLeft", { amount: money(gift.remainingMinor, currency) })}
              </p>
              {!isCase && <p className="line-clamp-1 text-[11px] text-[var(--muted)]">{gift.product!.title}</p>}
              {rarest && <p className="line-clamp-1 text-[11px] text-[var(--muted)]">{t("case.teaser", { title: rarest.title })}</p>}
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <motion.div
                  className="h-full rounded-full bg-[var(--accent)]"
                  initial={false}
                  animate={{ width: `${Math.round(share * 100)}%` }}
                  transition={spring}
                />
              </div>
            </>
          )}
        </div>
      </div>
      {isCase && (
        <GiftCasePrizeDisclosure label={t("case.canDrop")} className="mt-1">
          <GiftCasePrizeRows items={gift.caseItems} rarity={rarity} resolveImage={caseImage} locale={locale} />
        </GiftCasePrizeDisclosure>
      )}
    </div>
  );
}
