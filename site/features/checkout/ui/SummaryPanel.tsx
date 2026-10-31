import Link from "next/link";
import { type GiftChoice, type GiftProgress, type GiftTierInfo } from "@shop/core/giftcase";
import { type OrderLimitCode } from "@shop/core/orders";
import { type PaymentOption } from "@shop/core/types";
import { Button } from "@shop/ui/primitives";
import { GiftChoicePicker } from "@shop/ui/gift-case";
import { CheckoutGiftLine } from "@/features/gift/view";
import { useCaseMoney, useCaseRules } from "@/features/gift/view";
import { type CartLine } from "@/features/cart";
import { useI18n } from "@/i18n/context";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";
import { type usePromoPreview } from "./PromoField";
import { Row } from "./parts";

interface Props {
  lines: CartLine[];
  currency: string;
  subtotal: number;
  /** Promo discount, minor units. */
  discount: number;
  promoCode: string;
  promo: ReturnType<typeof usePromoPreview>;
  gift: GiftProgress | null;
  giftTier: GiftTierInfo | null;
  giftChoice: GiftChoice;
  onGiftChoice: (c: GiftChoice) => void;
  giftDiscount: number;
  /** Total after the promo, before the gift discount (what the gift tier is counted from). */
  baseTotal: number;
  total: number;
  chosen: PaymentOption | null;
  dueNow: number;
  submitLabel: string;
  submitting: boolean;
  submitError: string | null;
  limitCode: OrderLimitCode | null;
}

export function SummaryPanel(p: Props) {
  const { t, href } = useI18n();
  const fmt = useFmt();
  const { lines, currency, subtotal, discount, promoCode, promo, gift, giftTier, giftDiscount, total, chosen, dueNow } = p;
  const giftLine = gift && giftDiscount === 0 ? gift : null;
  const caseMoney = useCaseMoney();
  const caseRules = useCaseRules();
  return (
    <aside className="min-w-0">
      <div className="nb-lg hud-frame flex flex-col gap-4 p-5 lg:sticky lg:top-[140px]">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-display font-bold uppercase tracking-[.06em] text-[var(--ink)]">{t("checkout.summary")}</h2>
          <Link href={href("/cart")} className="font-display text-[12px] font-semibold uppercase tracking-[.08em] text-[var(--muted)] transition-colors hover:text-[var(--accent-hi)]">
            {t("checkout.edit")}
          </Link>
        </div>
        <ItemsList lines={lines} currency={currency} gift={giftLine} />
        {giftTier && giftTier.guaranteedPercent > 0 && (
          <GiftChoicePicker
            tier={giftTier}
            totalMinor={p.baseTotal}
            value={p.giftChoice}
            onChange={p.onGiftChoice}
            money={caseMoney}
            texts={{
              title: t("case.choice.title"),
              tierName: t(`case.tier.${giftTier.tier}` as "case.tier.GOLD"),
              caseTitle: t("case.choice.caseTitle"),
              caseText: t("case.choice.caseText"),
              hint: t("case.choice.hint"),
              discountTitle: t("case.choice.discountTitle"),
              discountText: t("case.choice.discountText"),
            }}
            rules={caseRules}
          />
        )}
        <div className="flex flex-col gap-1.5 border-t border-[var(--line)] pt-3 text-[14px]">
          <Row label={t("checkout.sum")} value={fmt.money(subtotal, currency)} />
          {discount > 0 && (
            <Row
              label={promoCode ? t("checkout.discountWithCode", { code: promoCode }) : t("checkout.discount")}
              value={`−${fmt.money(discount, currency)}`}
              tone="ok"
            />
          )}
          {giftDiscount > 0 && <Row label={t("case.lineDiscount")} value={`−${fmt.money(giftDiscount, currency)}`} tone="ok" />}
          <Row label={t("checkout.deliveryCost")} value={t("checkout.deliveryCostValue")} muted />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[16px] font-display font-bold uppercase tracking-[.06em] text-[var(--ink)]">{t("checkout.total")}</span>
          <span className="font-display text-[22px] font-bold tabular-nums text-[var(--accent)]">
            {fmt.money(total, currency)}
          </span>
        </div>
        {chosen && dueNow !== total && (
          <div className="-mt-1 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
            <Row label={t("checkout.dueNow")} value={fmt.money(dueNow, currency)} strong />
            <p className="mt-1 text-[12px] font-semibold text-[var(--muted)]">
              {t("checkout.rest", { amount: fmt.money(total - dueNow, currency) })}
            </p>
          </div>
        )}
        <PromoProblem code={promoCode} promo={promo} />
        <SubmitError message={p.submitError} limitCode={p.limitCode} />
        <Button type="submit" variant="accent" size="lg" fullWidth loading={p.submitting}>
          {p.submitLabel}
        </Button>
        {dueNow > 0 && (
          <p className="-mt-1 text-center text-[12px] font-semibold text-[var(--muted)]">
            {t("checkout.submitHint", { amount: fmt.money(dueNow, currency) })}
          </p>
        )}
        <p className="text-center text-[12px] font-medium text-[var(--muted)]">
          {t("checkout.agree")}{" "}
          <Link href={href("/terms")} target="_blank" className="link-ink font-semibold text-[var(--ink)]">
            {t("checkout.agreeLink")}
          </Link>
        </p>
      </div>
    </aside>
  );
}

function ItemsList({ lines, currency, gift }: { lines: CartLine[]; currency: string; gift: GiftProgress | null }) {
  const { t } = useI18n();
  const fmt = useFmt();
  return (
  <ul className="flex max-h-[300px] flex-col gap-3 overflow-y-auto pr-1">
    {lines.map((l) => (
      <li key={l.key} className={`flex items-center gap-3 ${l.stock <= 0 ? "opacity-50" : ""}`}>
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]">
          <Image src={l.imageUrl} alt="" size={120} className="h-full w-full" />
          <span className="absolute bottom-0 right-0 rounded-tl-[var(--r)] bg-[rgba(14,14,16,.85)] px-1.5 font-display text-[10px] font-bold text-[var(--ink)]">
            ×{l.quantity}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[13px] font-medium text-[var(--ink)]">{l.title}</span>
          {l.variantName && <span className="block text-[12px] font-semibold text-[var(--muted)]">{l.variantName}</span>}
          {l.stock <= 0 && <span className="block text-[12px] font-semibold text-[var(--danger)]">{t("cart.unavailable")}</span>}
        </span>
        <span className="shrink-0 font-display text-[14px] font-bold tabular-nums text-[var(--ink)]">{fmt.money(l.priceMinor * l.quantity, l.currency)}</span>
      </li>
    ))}
    {gift && <CheckoutGiftLine gift={gift} currency={currency} />}
  </ul>
  );
}

function SubmitError({ message, limitCode }: { message: string | null; limitCode: OrderLimitCode | null }) {
  const { t, href } = useI18n();
  if (!message) return null;
  return (
    <p role="alert" className="rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_55%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[13px] font-medium text-[var(--danger)]">
      {message}
      {limitCode === "TOO_MANY_UNPAID" && (
        <>
          {" "}
          <Link href={href("/account")} className="font-semibold underline">
            {t("checkout.toOrders")}
          </Link>
        </>
      )}
    </p>
  );
}

function PromoProblem({ code, promo }: { code: string; promo: ReturnType<typeof usePromoPreview> }) {
  const { t } = useI18n();
  if (!code || promo.loading || !promo.data || promo.data.valid) return null;
  return (
    <p className="text-[12px] font-medium text-[var(--danger)]">
      {t("checkout.promoProblem", { code, message: promo.data.message ?? t("promo.notFound") })}
    </p>
  );
}
