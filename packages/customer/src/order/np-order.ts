/**
 * Заказ checkout v2 глазами покупателя — одно правило для сайта и Mini App: кто получает, куда везёт курьер,
 * сколько отдать «Новій пошті» при получении (не просить ли онлайн-оплату — onDeliveryUnpaid в @shop/core/orders).
 */
import type { OrderNpFields } from "../delivery/contract";

type NpOrder = OrderNpFields & {
  customerName?: string | null;
  paid?: boolean;
  totalMinor?: number;
  receivedMinor?: number;
};

/** «Прізвище Ім'я По батькові» из полей получателя; старый заказ — `customerName`. */
export function orderRecipientName(o: NpOrder): string {
  const parts = [o.recipientLastName, o.recipientFirstName, o.recipientMiddleName].map((x) => (x ?? "").trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : (o.customerName ?? "");
}

/** Адрес курьера «вулиця, будинок, кв.» или пусто (не курьер / старый заказ). */
export function orderCourierAddress(o: NpOrder): string {
  if (o.npServiceType !== "DOORS") return "";
  return [o.npStreetName, o.npBuilding, o.npFlat].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");
}

/** Сколько отдать «Новій пошті» за товар: наложенный платёж посылки, до ТТН — остаток суммы заказа. */
export function codAmountMinor(o: NpOrder): number {
  const cod = o.shipment?.codMinor ?? 0;
  if (cod > 0) return cod;
  return Math.max(0, (o.totalMinor ?? 0) - (o.receivedMinor ?? 0));
}
