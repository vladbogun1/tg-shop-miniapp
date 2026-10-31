"use client";

/**
 * Product page: «you get a gift case with this» — a compact banner next to the buy actions.
 * Data: GET /api/public/gift (lib/gift.ts),
 * progress = the cheapest tier's threshold − this product's price.
 *
 *   CASE, reached     → «🎁 З цим товаром — срібний кейс у подарунок…» + «Усередині, наприклад: <rarest>» + «Що може бути в кейсі»
 *   CASE, not reached → «Замовлення від 1 500 ₴ — кейс із подарунком» + «З цим товаром ще N ₴»
 *   PRODUCT           → the same for the single known gift
 */
import { Gift } from "lucide-react";
import { giftProgress, rarestCasePrize } from "@shop/core/giftcase";
import { giftView } from "@shop/customer/gift/model";
import { GiftCaseArt, GiftCasePrizeDisclosure, GiftCasePrizeRows } from "@shop/ui/gift-case";
import { caseImage, caseMoney, CaseRulesInline, useCaseRarityNames } from "@/features/gift/ui/OrderGiftCase";
import { useT } from "@/i18n/context";
import { useGift } from "@/features/gift/use-gift";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";

export function ProductGiftBanner({ priceMinor, currency }: { priceMinor: number; currency: string }) {
  const t = useT();
  const rarity = useCaseRarityNames();
  const gift = giftProgress(useGift(), priceMinor);
  const view = giftView(gift);
  if (!gift || !view) return null;
  const { isCase, shownTier, done, rarest } = view;
  const threshold = money(gift.thresholdMinor, currency);

  const title = isCase
    ? done && gift.tier
      ? t("case.product.reached", { tier: t(`case.tierAcc.${gift.tier.tier}`) })
      : t("case.product.threshold", { amount: threshold })
    : done
      ? t("case.product.giftReached", { title: gift.product!.title })
      : t("case.product.giftThreshold", { amount: threshold, title: gift.product!.title });

  return (
    <section className={`nb mt-4 p-3 ${done ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)]" : ""}`}>
      <div className="flex items-center gap-3">
        {isCase ? (
          <GiftCaseArt glow={done} tier={shownTier?.tier} className="h-11 w-16" />
        ) : (
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)]">
            <Image src={gift.product!.images?.[0]?.url} alt={gift.product!.title} size={120} className="h-full w-full" />
            <span className="absolute -bottom-px -right-px grid h-5 w-5 place-items-center rounded-tl-[6px] bg-[var(--accent)] text-[var(--accent-ink)]">
              <Gift className="h-3 w-3" strokeWidth={2.75} />
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-semibold leading-snug ${done ? "text-[var(--accent-hi)]" : "text-[var(--ink)]"}`}>{title}</p>
          {rarest?.title && <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-[var(--muted)]">{t("case.teaser", { title: rarest.title })}</p>}
          {!done && (
            <p className="mt-0.5 text-[11px] font-medium text-[var(--muted)]">
              {t("case.product.remaining", { amount: money(gift.remainingMinor, currency) })}
            </p>
          )}
        </div>
      </div>
      {isCase && shownTier && (
        <GiftCasePrizeDisclosure label={t("case.canDrop")} className="mt-1" tier={shownTier.tier} aside={<CaseRulesInline />}>
          <GiftCasePrizeRows items={shownTier.prizes} rarity={rarity} resolveImage={caseImage} money={caseMoney} discountLabel={t("case.discountRow")} />
        </GiftCasePrizeDisclosure>
      )}
    </section>
  );
}
