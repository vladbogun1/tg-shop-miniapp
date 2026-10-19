"use client";

/**
 * Cart: progress to the gift for the order sum, or the gift that is already earned (docs/GIFT-CASE.md).
 * `totalMinor` = the cart total after the discount. CASE mode, three
 * tiers: «Купіть ще на N ₴ — і отримаєте бронзовий кейс» / the celebratory «🎉 Вітаємо! …» with the
 * reached tier's glowing case and «ще N ₴ — і кейс стане кращим: золотий кейс»; the tier ladder, the
 * rarest prize teaser and an expandable «Що може бути в кейсі» of the tier (no chances).
 */
import { motion } from "framer-motion";
import { Gift } from "lucide-react";
import { CASE_TIER_ORDER, giftProgress, rarestCasePrize, type CaseTier } from "@shop/shared";
import { GiftCaseArt, GiftCasePrizeDisclosure, GiftCasePrizeRows, GiftCaseTierLadder } from "@shop/shared/case-ui";
import { caseImage, caseMoney, CaseRulesInline, useCaseRarityNames } from "@/components/case/OrderGiftCase";
import { useT } from "@/i18n/context";
import { useGift } from "@/lib/gift";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { spring } from "@/lib/motion";

export function useCaseTierShort(): Record<CaseTier, string> {
  const t = useT();
  return Object.fromEntries(CASE_TIER_ORDER.map((r) => [r, t(`case.tierShort.${r}`)])) as Record<CaseTier, string>;
}

export function CartGiftProgress({ totalMinor, currency }: { totalMinor: number; currency: string }) {
  const t = useT();
  const rarity = useCaseRarityNames();
  const short = useCaseTierShort();
  const gift = giftProgress(useGift(), totalMinor);
  if (!gift) return null;
  const isCase = gift.kind === "CASE";
  const shownTier = isCase ? (gift.tier ?? gift.next ?? gift.tiers[0] ?? null) : null;
  if (isCase ? !shownTier?.prizes.length : !gift.product) return null;
  const done = gift.reached;
  const rarest = shownTier ? rarestCasePrize(shownTier.prizes) : null;
  const acc = (tier: CaseTier) => t(`case.tierAcc.${tier}`);
  return (
    <div className={`nb mt-4 p-3 ${isCase && done ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)]" : ""}`}>
      <div className="flex items-center gap-3">
        {isCase ? (
          <GiftCaseArt glow={done} tier={shownTier?.tier} className="h-12 w-[72px]" />
        ) : (
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)]">
            <Image src={gift.product!.images?.[0]?.url} alt={gift.product!.title} size={120} className="h-full w-full" />
            <span className="absolute -bottom-px -right-px grid h-5 w-5 place-items-center rounded-tl-[6px] bg-[var(--accent)] text-[var(--accent-ink)]">
              <Gift className="h-3 w-3" strokeWidth={2.75} />
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          {isCase ? (
            <>
              <p className={`text-[13px] font-semibold leading-snug ${done ? "text-[var(--accent-hi)]" : "text-[var(--ink)]"}`}>
                {done && gift.tier
                  ? t("case.reached", { tier: acc(gift.tier.tier) })
                  : t("case.progress", { amount: money(gift.remainingMinor, currency), tier: acc(shownTier!.tier) })}
              </p>
              {done && gift.next && (
                <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                  {t("case.upgrade", { amount: money(gift.remainingMinor, currency), tier: acc(gift.next.tier) })}
                </p>
              )}
              {rarest?.title && <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--muted)]">{t("case.teaser", { title: rarest.title })}</p>}
              {!done && gift.tiers.length <= 1 && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <motion.div
                    className="h-full rounded-full bg-[var(--accent)]"
                    initial={false}
                    animate={{ width: `${Math.round(gift.share * 100)}%` }}
                    transition={spring}
                  />
                </div>
              )}
            </>
          ) : gift.reached ? (
            <p className="text-[13px] font-semibold leading-snug text-[var(--ink)]">🎁 {t("case.giftReached", { title: gift.product!.title })}</p>
          ) : (
            <>
              <p className="text-[13px] font-semibold leading-snug text-[var(--ink)]">{t("case.giftLeft", { amount: money(gift.remainingMinor, currency) })}</p>
              <p className="line-clamp-1 text-[11px] text-[var(--muted)]">{gift.product!.title}</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <motion.div
                  className="h-full rounded-full bg-[var(--accent)]"
                  initial={false}
                  animate={{ width: `${Math.round(gift.share * 100)}%` }}
                  transition={spring}
                />
              </div>
            </>
          )}
        </div>
      </div>
      {isCase && gift.tiers.length > 1 && <GiftCaseTierLadder tiers={gift.tiers} totalMinor={totalMinor} names={short} money={caseMoney} />}
      {isCase && shownTier && (
        <GiftCasePrizeDisclosure label={t("case.canDrop")} className="mt-1" tier={shownTier.tier} aside={<CaseRulesInline />}>
          <GiftCasePrizeRows items={shownTier.prizes} rarity={rarity} resolveImage={caseImage} money={caseMoney} discountLabel={t("case.discountRow")} />
        </GiftCasePrizeDisclosure>
      )}
    </div>
  );
}
