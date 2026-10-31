"use client";

/**
 * Gift for the order sum in the cart (page and drawer): «До подарунка ще N ₴» with a progress bar, or
 * «🎁 Подарунок … додамо безкоштовно». In CASE mode (gift cases of three tiers, V57): «Купіть ще на N ₴ —
 * і отримаєте бронзовий кейс» / the celebratory «🎉 Вітаємо! …» with the reached tier's glowing case,
 * «ще N ₴ — і кейс стане кращим», the tier ladder, the rarest prize teaser and an expandable «Що може
 * випасти» of the tier (no chances). `totalMinor` = the cart total after
 * the discount (what the server counts against the threshold).
 */
import { Gift } from "lucide-react";
import { giftView } from "@shop/customer/gift/model";
import { type Product } from "@shop/core/types";
import { GiftCaseArt, GiftCasePrizeDisclosure, GiftCasePrizeRows, GiftCaseTierLadder } from "@shop/ui/gift-case";
import { CaseRulesInline, useCaseMoney, useCaseRarityNames, useCaseTierNames } from "@/features/gift/ui/OrderGiftCase";
import { useI18n } from "@/i18n/context";
import { useGiftProgress } from "@/features/gift";
import { Image, resolveImageSrc } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";

const caseImage = (src: string, size: number) => resolveImageSrc(src, size);

function firstImage(p: Product): string | null {
  const imgs = (p.images ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return imgs[0]?.url ?? null;
}

export function CartGiftProgress({
  totalMinor,
  compact = false,
  className,
}: {
  totalMinor: number;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const fmt = useFmt();
  const money = useCaseMoney();
  const rarity = useCaseRarityNames();
  const short = useCaseTierNames("tierShort");
  const acc = useCaseTierNames("tierAcc");
  const gift = useGiftProgress(totalMinor);
  const view = giftView(gift);
  if (!gift || !view) return null;
  const { isCase, shownTier, done, rarest } = view;
  const pct = Math.max(done ? 0 : 4, Math.min(100, gift.share * 100));
  const thumb = compact ? "h-10 w-10" : "h-12 w-12";
  const ladder = isCase && gift.tiers.length > 1;
  const text = isCase
    ? done && gift.tier
      ? t("case.reached", { tier: acc[gift.tier.tier] })
      : t("case.progress", { amount: fmt.money(gift.remainingMinor), tier: acc[shownTier!.tier] })
    : done
      ? t("case.gift.reached", { title: gift.product!.title })
      : t("case.gift.progress", { amount: fmt.money(gift.remainingMinor) });
  return (
    <div
      className={`${className ?? ""} rounded-[var(--r-card)] border p-2.5 ${
        done
          ? isCase
            ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
            : "border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[color-mix(in_srgb,var(--ok)_8%,transparent)]"
          : "border-[var(--line)] bg-[var(--surface-2)]"
      }`}
    >
      <div className="flex items-center gap-3">
        {isCase ? (
          <GiftCaseArt glow={done} tier={shownTier?.tier} className={compact ? "h-10 w-14" : "h-12 w-[72px]"} />
        ) : (
          <span className={`relative ${thumb} shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)]`}>
            <Image src={firstImage(gift.product!)} alt="" size={120} className="h-full w-full" />
            <span className="absolute bottom-0 right-0 grid h-4 w-4 place-items-center rounded-tl-[6px] bg-[var(--accent)] text-[#0e0e10]">
              <Gift className="h-3 w-3" strokeWidth={2.5} />
            </span>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p
            className={`${isCase && done ? "" : compact ? "line-clamp-2" : "line-clamp-3"} ${compact ? "text-[12px]" : "text-[13px]"} font-semibold leading-snug ${
              done ? (isCase ? "text-[var(--accent-hi)]" : "text-[var(--ok)]") : "text-[var(--ink)]"
            }`}
          >
            {text}
          </p>
          {isCase && done && gift.next && (
            <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
              {t("case.upgrade", { amount: fmt.money(gift.remainingMinor), tier: acc[gift.next.tier] })}
            </p>
          )}
          {isCase && rarest?.title && (
            <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-[var(--muted)]">{t("case.teaser", { title: rarest.title })}</p>
          )}
          {!done && !ladder && (
            <>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
              >
                <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              {!isCase && <p className="mt-1 line-clamp-1 text-[11px] font-medium text-[var(--muted)]">{gift.product!.title}</p>}
            </>
          )}
        </div>
      </div>
      {ladder && <GiftCaseTierLadder tiers={gift.tiers} totalMinor={totalMinor} names={short} money={money} />}
      {isCase && shownTier && (
        <GiftCasePrizeDisclosure label={t("case.canDrop")} className="mt-1" tier={shownTier.tier} aside={<CaseRulesInline />}>
          <GiftCasePrizeRows items={shownTier.prizes} rarity={rarity} resolveImage={caseImage} money={money} discountLabel={t("case.discountRow")} />
        </GiftCasePrizeDisclosure>
      )}
    </div>
  );
}
