"use client";

import { caseTierAsset } from "@shop/ui/gift-case";
import type { GiftTierInfo } from "@shop/core/giftcase";
import { useT } from "@/i18n/context";
import { money } from "@/lib/money";

type Gift = { title: string; isCase?: boolean; tier?: GiftTierInfo["tier"] | null };

/** The gift for the order sum: a case (with its picture) or a plain gift, at 0. */
function GiftLine({ gift, currency }: { gift: Gift; currency: string }) {
  const t = useT();
  return (
        <div className="flex items-center justify-between gap-2 py-1.5">
          {gift.isCase ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-[14px] font-semibold text-[var(--ink)]">
              <img src={caseTierAsset("/case", gift.tier ?? null, "case-closed-sm.webp")} alt="" className="h-8 w-12 shrink-0 object-contain" />
              <span className="line-clamp-2">{gift.title}</span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 text-[14px] font-semibold text-[var(--ink)]">
              <span className="line-clamp-2">{gift.title}</span>
              <span className="block text-[12px] font-medium text-[var(--muted)]">{t("case.giftLine")}</span>
            </span>
          )}
          <span className="font-display text-[14px] font-semibold tabular-nums text-[var(--ok)]">{money(0, currency)}</span>
        </div>
  );
}

/** "Sum", the promo discount and the gift discount, when there are any. */
function DiscountLines({
  subtotal,
  discount,
  giftDiscount,
  promoCode,
  currency,
}: {
  subtotal: number;
  discount: number;
  giftDiscount: number;
  promoCode: string;
  currency: string;
}) {
  const t = useT();
  return (
    <>
        <div className="flex items-center justify-between py-0.5">
          <span className="text-[13px] font-semibold text-[var(--muted)]">{t("checkout.confirm.sum")}</span>
          <span className="text-[14px] font-bold text-[var(--muted)]">
            {money(subtotal, currency)}
          </span>
        </div>
        {discount > 0 && (
        <div className="flex items-center justify-between py-0.5">
          <span className="text-[13px] font-semibold text-[var(--muted)]">
            {promoCode
              ? t("checkout.confirm.discountWithCode", { code: promoCode })
              : t("checkout.confirm.discount")}
          </span>
          <span className="font-display text-[14px] font-bold tabular-nums text-[var(--ok)]">
            −{money(discount, currency)}
          </span>
        </div>
        )}
        {giftDiscount > 0 && (
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[13px] font-semibold text-[var(--muted)]">{t("case.lineDiscount")}</span>
            <span className="font-display text-[14px] font-bold tabular-nums text-[var(--ok)]">−{money(giftDiscount, currency)}</span>
          </div>
        )}
        <div className="my-2 h-px bg-[var(--line)]" />
    </>
  );
}

/** Prepay options charge part now and the rest on delivery — show both. */
function DueNowLines({ total, dueNow, currency }: { total: number; dueNow: number; currency: string }) {
  const t = useT();
  return (
    <>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[13px] font-bold text-[var(--ink)]">{t("checkout.confirm.dueNow")}</span>
          <span className="font-display text-[15px] font-bold tabular-nums text-[var(--ink)]">
            {money(dueNow, currency)}
          </span>
        </div>
        <p className="mt-1 text-[12px] font-semibold text-[var(--muted)]">
          {t("checkout.confirm.rest", { amount: money(total - dueNow, currency) })}
        </p>
    </>
  );
}

export function ConfirmSummary({
  items,
  gift,
  subtotal,
  discount,
  giftDiscount,
  promoCode,
  promoMessage,
  total,
  dueNow,
  currency,
}: {
  items: { title: string; qty: number; amount: number; currency: string }[];
  gift: Gift | null;
  subtotal: number;
  discount: number;
  giftDiscount: number;
  promoCode: string;
  promoMessage: string | null;
  total: number;
  dueNow: number;
  currency: string;
}) {
  const t = useT();
  return (
  <section className="hud-frame rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_8px_24px_-12px_var(--shadow)]">
        <h3 className="eyebrow mb-2 !text-[10px] !tracking-[0.2em]">
          {t("checkout.confirm.items")}
        </h3>
        {items.map((it, i) => (
          <div key={i} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--ink)]">
              {it.title}
              <span className="text-[var(--faint)]"> × {it.qty}</span>
            </span>
            <span className="font-display text-[14px] font-semibold tabular-nums text-[var(--ink)]">
              {money(it.amount, it.currency)}
            </span>
          </div>
        ))}
        {gift && <GiftLine gift={gift} currency={currency} />}
        <div className="my-3 h-px bg-[var(--line)]" />

        {(discount > 0 || giftDiscount > 0) && (
          <DiscountLines subtotal={subtotal} discount={discount} giftDiscount={giftDiscount} promoCode={promoCode} currency={currency} />
        )}

        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold font-display uppercase tracking-[0.08em] text-[var(--ink)]">
            {t("checkout.confirm.total")}
          </span>
          <span className="font-display text-[20px] font-bold tabular-nums text-[var(--accent)]">
            {money(total, currency)}
          </span>
        </div>

        {/* Prepay options charge part of the total now and the rest on delivery — show both. */}
        {dueNow !== total && <DueNowLines total={total} dueNow={dueNow} currency={currency} />}

        {promoCode && discount === 0 && (
          <p className="mt-2 text-[12px] font-bold text-[var(--danger)]">
            {t("checkout.confirm.promoProblem", {
              code: promoCode,
              message: promoMessage ?? t("checkout.confirm.promoChecking"),
            })}
          </p>
        )}
      </section>
  );
}
