"use client";

/**
 * Product page: «you get a gift case with this» — a compact banner next to the buy actions, separate
 * from «Разом дешевше» (shown even when the bundle has nothing to offer). Data: `gift` of
 * GET /api/public/bundles/product/{id} (remainingMinor = threshold − this product's price).
 *
 *   CASE, reached     → «🎁 З цим товаром — кейс у подарунок…» + «Можна вибити: <rarest>» + «Що може випасти»
 *   CASE, not reached → «Замовлення від 3 000 ₴ — кейс з дропом у подарунок» + «З цим товаром ще N ₴»
 *   PRODUCT           → the same for the single known gift
 */
import { Gift } from "lucide-react";
import { rarestCasePrize } from "@shop/shared";
import { GiftCaseArt, GiftCasePrizeDisclosure, GiftCasePrizeRows } from "@shop/shared/case-ui";
import { caseImage, useCaseRarityNames } from "@/components/case/OrderGiftCase";
import { useI18n, useT } from "@/i18n/context";
import { useBundleOffer } from "@/lib/bundle";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";

export function ProductGiftBanner({ productId, currency }: { productId: string; currency: string }) {
  const t = useT();
  const { locale } = useI18n();
  const rarity = useCaseRarityNames();
  const { data } = useBundleOffer(productId);
  const gift = data?.gift;
  if (!gift) return null;
  const isCase = gift.kind === "CASE";
  if (isCase ? !gift.caseItems?.length : !gift.product) return null;
  const done = gift.reached || gift.remainingMinor <= 0;
  const rarest = isCase ? rarestCasePrize(gift.caseItems) : null;
  const threshold = money(gift.thresholdMinor, currency);

  const title = isCase
    ? done
      ? t("case.product.reached")
      : t("case.product.threshold", { amount: threshold })
    : done
      ? t("case.product.giftReached", { title: gift.product!.title })
      : t("case.product.giftThreshold", { amount: threshold, title: gift.product!.title });

  return (
    <section className={`nb mt-4 p-3 ${done ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)]" : ""}`}>
      <div className="flex items-center gap-3">
        {isCase ? (
          <GiftCaseArt glow={done} className="h-11 w-16" />
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
          {rarest && <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-[var(--muted)]">{t("case.teaser", { title: rarest.title })}</p>}
          {!done && (
            <p className="mt-0.5 text-[11px] font-medium text-[var(--muted)]">
              {t("case.product.remaining", { amount: money(gift.remainingMinor, currency) })}
            </p>
          )}
        </div>
      </div>
      {isCase && (
        <GiftCasePrizeDisclosure label={t("case.canDrop")} className="mt-1">
          <GiftCasePrizeRows items={gift.caseItems} rarity={rarity} resolveImage={caseImage} locale={locale} />
        </GiftCasePrizeDisclosure>
      )}
    </section>
  );
}
