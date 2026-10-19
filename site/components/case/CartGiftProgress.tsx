"use client";

/**
 * Gift for the order sum in the cart (page and drawer): «До подарунка ще N ₴» with a progress bar, or
 * «🎁 Подарунок … додамо безкоштовно». In CASE mode (gift case, V58): «Купіть ще на N ₴ — і отримаєте
 * кейс з дропом» / the celebratory «🎉 Вітаємо! …» with a glowing case, the rarest prize teaser and an
 * expandable «Що може випасти». Independent of «Разом дешевше»; `totalMinor` = the cart total after
 * the discount (what the server counts against the threshold).
 */
import { Gift } from "lucide-react";
import { rarestCasePrize, type Product } from "@shop/shared";
import { GiftCaseArt, GiftCasePrizeDisclosure, GiftCasePrizeRows } from "@shop/shared/case-ui";
import { useCaseRarityNames } from "@/components/case/OrderGiftCase";
import { useI18n } from "@/i18n/context";
import { useGiftProgress } from "@/lib/gift";
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
  const { t, locale } = useI18n();
  const fmt = useFmt();
  const rarity = useCaseRarityNames();
  const gift = useGiftProgress(totalMinor);
  if (!gift) return null;
  const isCase = gift.kind === "CASE";
  const done = gift.reached || gift.remainingMinor <= 0;
  const pct = done
    ? 100
    : gift.thresholdMinor > 0
      ? Math.max(4, Math.min(100, ((gift.thresholdMinor - gift.remainingMinor) / gift.thresholdMinor) * 100))
      : 0;
  const thumb = compact ? "h-10 w-10" : "h-12 w-12";
  const rarest = isCase ? rarestCasePrize(gift.caseItems) : null;
  const text = isCase
    ? done
      ? t("case.reached")
      : t("case.progress", { amount: fmt.money(gift.remainingMinor) })
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
          <GiftCaseArt glow={done} className={compact ? "h-10 w-14" : "h-12 w-[72px]"} />
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
          {isCase && rarest && (
            <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-[var(--muted)]">{t("case.teaser", { title: rarest.title })}</p>
          )}
          {!done && (
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
      {isCase && (
        <GiftCasePrizeDisclosure label={t("case.canDrop")} className="mt-1">
          <GiftCasePrizeRows items={gift.caseItems} rarity={rarity} resolveImage={caseImage} locale={locale} />
        </GiftCasePrizeDisclosure>
      )}
    </div>
  );
}
