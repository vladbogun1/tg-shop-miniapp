import type { LooseT } from "@shop/core/i18n";
import type { OrderDetail } from "@/lib/api";

type T = LooseT;

/** "Картка •• 1902", "Apple Pay · •• 1902", "monobank" — or null when the money came otherwise. */
export function methodLabel(order: OrderDetail, t: T): string | null {
  const p = order.payment;
  if (p.status !== "success") return null;
  const last4 = p.maskedPan ? p.maskedPan.replace(/\D/g, "").slice(-4) : "";
  const pan = last4 ? `•• ${last4}` : "";
  switch (p.paymentMethod) {
    case "apple":
      return [t("pay.method.apple"), pan].filter(Boolean).join(" · ");
    case "google":
      return [t("pay.method.google"), pan].filter(Boolean).join(" · ");
    case "monobank":
      return t("pay.method.monobank");
    default:
      return last4 ? t("pay.method.card", { last4 }) : null;
  }
}

export function leftText(ms: number, t: T): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? t("pay.hm", { h, m }) : t("pay.m", { m });
}
