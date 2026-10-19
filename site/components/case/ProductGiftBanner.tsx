"use client";

/**
 * Product page: «you get a gift case with this» — a compact banner under the buy box.
 * Data: `useGift` (GET /api/public/gift),
 * progress counted on the product's price.
 *
 *   CASE, reached     → «🎁 З цим товаром — срібний кейс у подарунок…» + «Можна вибити: <rarest>» + «Що може випасти»
 *   CASE, not reached → «Замовлення від 3 000 ₴ — кейс з дропом у подарунок» + «З цим товаром ще N ₴»
 *   PRODUCT           → the same for the single known gift
 */
import { Gift } from "lucide-react";
import { rarestCasePrize } from "@shop/shared";
import { GiftCaseArt, GiftCasePrizeDisclosure, GiftCasePrizeRows } from "@shop/shared/case-ui";
import { useCaseMoney, useCaseRarityNames, useCaseTierNames } from "@/components/case/OrderGiftCase";
import { useI18n } from "@/i18n/context";
import { useGiftProgress } from "@/lib/gift";
import { Image, resolveImageSrc } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";

const caseImage = (src: string, size: number) => resolveImageSrc(src, size);

/** `priceMinor` — the price of this product (what it brings towards the gift threshold). */
export function ProductGiftBanner({ priceMinor }: { priceMinor: number }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const money = useCaseMoney();
  const rarity = useCaseRarityNames();
  const acc = useCaseTierNames("tierAcc");
  const gift = useGiftProgress(priceMinor);
  if (!gift) return null;
  const isCase = gift.kind === "CASE";
  const shownTier = isCase ? (gift.tier ?? gift.next ?? gift.tiers[0] ?? null) : null;
  if (isCase && !shownTier?.prizes.length) return null;
  const done = gift.reached;
  const rarest = shownTier ? rarestCasePrize(shownTier.prizes) : null;
  const threshold = fmt.money(gift.thresholdMinor);

  const title = isCase
    ? done && gift.tier
      ? t("case.product.reached", { tier: acc[gift.tier.tier] })
      : t("case.product.threshold", { amount: threshold })
    : done
      ? t("case.product.giftReached", { title: gift.product!.title })
      : t("case.product.giftThreshold", { amount: threshold, title: gift.product!.title });

  return (
    <section
      className={`mt-4 rounded-[var(--r-card)] border p-3 ${
        done
          ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
          : "border-[var(--line)] bg-[var(--surface-2)]"
      }`}
    >
      <div className="flex items-center gap-3">
        {isCase ? (
          <GiftCaseArt glow={done} tier={shownTier?.tier} className="h-11 w-16" />
        ) : (
          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)]">
            <Image src={gift.product!.images?.[0]?.url ?? null} alt="" size={120} className="h-full w-full" />
            <span className="absolute bottom-0 right-0 grid h-4 w-4 place-items-center rounded-tl-[6px] bg-[var(--accent)] text-[#0e0e10]">
              <Gift className="h-3 w-3" strokeWidth={2.5} />
            </span>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-semibold leading-snug ${done ? "text-[var(--accent-hi)]" : "text-[var(--ink)]"}`}>{title}</p>
          {rarest?.title && <p className="mt-0.5 line-clamp-1 text-[12px] font-semibold text-[var(--muted)]">{t("case.teaser", { title: rarest.title })}</p>}
          {!done && (
            <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">
              {t("case.product.remaining", { amount: fmt.money(gift.remainingMinor) })}
            </p>
          )}
        </div>
      </div>
      {isCase && shownTier && (
        <GiftCasePrizeDisclosure label={t("case.canDrop")} className="mt-1" tier={shownTier.tier}>
          <GiftCasePrizeRows items={shownTier.prizes} rarity={rarity} resolveImage={caseImage} money={money} discountLabel={t("case.discountRow")} />
        </GiftCasePrizeDisclosure>
      )}
    </section>
  );
}
