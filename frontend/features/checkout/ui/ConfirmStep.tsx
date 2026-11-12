"use client";

import { GiftChoicePicker } from "@shop/ui/gift-case";
import type { GiftChoice, GiftTierInfo } from "@shop/core/giftcase";
import { caseMoney, useCaseRules } from "@/features/gift";
import { type CheckoutT, useCheckoutT } from "@/i18n/checkout";
import type { NpEstimateResponse } from "@shop/customer/delivery/contract";
import type { DeliveryDraft } from "@shop/customer/delivery/draft";
import { estimateAmounts } from "@shop/customer/delivery/estimate";
import { recipientLine } from "@shop/customer/delivery/recipient";
import type { PaymentOption } from "@/lib/api";
import { money } from "@/lib/money";
import { npLabel } from "../model/np-label";
import { haptic } from "@/platform/telegram";
import { ConfirmSummary } from "./ConfirmSummary";
import { PaymentTrust } from "./PaymentStep";

export function ConfirmStep({
  draft,
  phone,
  estimate,
  onDelivery,
  comment,
  payment,
  promoCode,
  promoMessage,
  subtotal,
  discount,
  gift,
  giftTier,
  giftChoice,
  onGiftChoice,
  giftDiscount,
  baseTotal,
  total,
  dueNow,
  currency,
  items,
}: {
  /** Tab, recipient, point or courier address (@shop/customer/delivery/draft). */
  draft: DeliveryDraft;
  phone: string;
  /** «≈ N ₴» from Nova Poshta's calculator, null — no number. */
  estimate: NpEstimateResponse | null;
  /** The chosen option is paid on receipt: no monobank, no 24 h. */
  onDelivery: boolean;
  comment: string;
  payment: PaymentOption | null;
  promoCode: string;
  /** Why the entered code does not apply, when it does not. */
  promoMessage: string | null;
  subtotal: number;
  discount: number;
  /** The gift for the order sum, when this order earns it. */
  gift: { title: string; isCase?: boolean; tier?: GiftTierInfo["tier"] | null } | null;
  /** The reached tier when it offers a guaranteed discount instead of the case (null = no choice). */
  giftTier: GiftTierInfo | null;
  giftChoice: GiftChoice;
  onGiftChoice: (v: GiftChoice) => void;
  /** The guaranteed gift discount chosen (part of the total shown, on top of `discount`). */
  giftDiscount: number;
  /** The total before the gift discount (what the discount is counted from). */
  baseTotal: number;
  total: number;
  /** Amount payable immediately (prepayment for prepay options, otherwise the full total). */
  dueNow: number;
  currency: string;
  items: { title: string; qty: number; amount: number; currency: string }[];
}) {
  const t = useCheckoutT();
  const caseRules = useCaseRules();
  const est = estimateAmounts(estimate);

  return (
    <div className="flex flex-col gap-4">
      {giftTier && (
        <GiftChoicePicker
          tier={giftTier}
          totalMinor={baseTotal}
          value={giftChoice}
          onChange={(v) => {
            haptic();
            onGiftChoice(v);
          }}
          money={caseMoney}
          texts={{
            title: t("case.choice.title"),
            tierName: t(`case.tier.${giftTier.tier}`),
            caseTitle: t("case.choice.caseTitle"),
            caseText: t("case.choice.caseText"),
            hint: t("case.choice.hint"),
            discountTitle: t("case.choice.discountTitle"),
            discountText: t("case.choice.discountText"),
          }}
          rules={caseRules}
        />
      )}
      <ConfirmSummary
        items={items}
        gift={gift}
        subtotal={subtotal}
        discount={discount}
        giftDiscount={giftDiscount}
        promoCode={promoCode}
        promoMessage={promoMessage}
        total={total}
        dueNow={dueNow}
        currency={currency}
      />

      <section className="flex flex-col gap-3 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_8px_24px_-12px_var(--shadow)]">
        <SummaryRow label={t("order.recipient")} value={`${recipientLine(draft.recipient)}, ${phone}`} />
        <SummaryRow label={t("order.delivery")} value={deliveryText(draft, t)} />
        {draft.tab !== "PICKUP" && (
          <SummaryRow
            label={t("delivery.cost.label")}
            value={est ? t("delivery.cost.separate", { amount: money(est.deliveryMinor, currency) }) : t("delivery.cost.unknown")}
          />
        )}
        <SummaryRow label={t("order.payment")} value={payment?.title ?? "—"} />
        {comment && <SummaryRow label={t("order.comment")} value={comment} />}
      </section>

      {draft.tab !== "PICKUP" && <p className="-mt-2 px-0.5 text-[12px] font-medium text-[var(--muted)]">{t("delivery.cost.note")}</p>}
      {!onDelivery && <PaymentTrust />}
    </div>
  );
}

/** «Поштомат №5 · Київ, вул. …», «Кур'єр · Київ, Хрещатик, 1, 12», «Самовивіз». */
function deliveryText(d: DeliveryDraft, t: CheckoutT): string {
  if (d.tab === "PICKUP") return t("order.pickup");
  if (d.tab === "DOORS") {
    const address = [d.city?.name, d.courier.streetName, d.courier.building, d.courier.flat].filter(Boolean).join(", ");
    return `${t("delivery.tab.courier")} · ${address}`;
  }
  const w = d.warehouse;
  if (!w) return "—";
  return `${npLabel(w, t)} · ${w.cityName ? w.cityName + ", " : ""}${w.description}`;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </span>
      <span className="text-[14px] font-medium text-[var(--ink)]">{value}</span>
    </div>
  );
}
