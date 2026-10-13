"use client";

/**
 * Product page: «you get a gift case with this» — a compact banner under the buy box, separate from
 * «Разом дешевше» (shown even when the bundle has nothing to offer). Data: `gift` of
 * GET /api/public/bundles/product/{id} (remainingMinor = threshold − this product's price).
 *
 *   CASE, reached     → «🎁 З цим товаром — кейс у подарунок…» + «Можна вибити: <rarest>» + «Що може випасти»
 *   CASE, not reached → «Замовлення від 3 000 ₴ — кейс з дропом у подарунок» + «З цим товаром ще N ₴»
 *   PRODUCT           → the same for the single known gift
 */
import { useQuery } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { rarestCasePrize } from "@shop/shared";
import { GiftCaseArt, GiftCasePrizeDisclosure, GiftCasePrizeRows } from "@shop/shared/case-ui";
import { useCaseRarityNames } from "@/components/case/OrderGiftCase";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { useHydrated } from "@/lib/hooks";
import { Image, resolveImageSrc } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";

/** The product's bundle offer (accessories + the gift), one request for the buy box and the banner. */
export function useBundleOfferQuery(productId: string) {
  const { locale } = useI18n();
  const hydrated = useHydrated();
  return useQuery({
    queryKey: ["bundle-offer", productId, locale],
    queryFn: () => api.bundleOffer(productId),
    enabled: hydrated,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

const caseImage = (src: string, size: number) => resolveImageSrc(src, size);

export function ProductGiftBanner({ productId }: { productId: string }) {
  const { t, locale } = useI18n();
  const fmt = useFmt();
  const rarity = useCaseRarityNames();
  const { data } = useBundleOfferQuery(productId);
  const gift = data?.gift;
  if (!gift) return null;
  const isCase = gift.kind === "CASE";
  if (isCase ? !gift.caseItems?.length : !gift.product) return null;
  const done = gift.reached || gift.remainingMinor <= 0;
  const rarest = isCase ? rarestCasePrize(gift.caseItems) : null;
  const threshold = fmt.money(gift.thresholdMinor);

  const title = isCase
    ? done
      ? t("case.product.reached")
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
          <GiftCaseArt glow={done} className="h-11 w-16" />
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
          {rarest && <p className="mt-0.5 line-clamp-1 text-[12px] font-semibold text-[var(--muted)]">{t("case.teaser", { title: rarest.title })}</p>}
          {!done && (
            <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">
              {t("case.product.remaining", { amount: fmt.money(gift.remainingMinor) })}
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
