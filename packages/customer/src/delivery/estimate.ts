/**
 * Подсказка «≈ N ₴ орієнтовно»: запрос к POST /api/np/estimate и что из ответа показать. Подсказка никогда не
 * мешает оформить заказ: нет ответа, ошибка, таймаут — просто нейтральная строка «за тарифом Нової пошти».
 */
import type { NpEstimateRequest, NpEstimateResponse } from "./contract";
import { draftCity, type DeliveryDraft } from "./draft";
import { isNpTab } from "./tabs";

export interface EstimateLine {
  productId: string;
  variantId?: string | null;
  quantity: number;
}

/** Запрос подсказки для черновика или null, если считать нечего (самовывоз, нет города, пустая корзина). */
export function estimateRequestOf(
  d: Pick<DeliveryDraft, "tab" | "city" | "warehouse">,
  lines: EstimateLine[],
  totalMinor: number,
  payOnDeliveryMinor: number,
): NpEstimateRequest | null {
  if (!isNpTab(d.tab) || lines.length === 0) return null;
  const city = draftCity(d);
  if (!city) return null;
  return {
    cityRef: city.ref,
    serviceType: d.tab,
    items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId ?? undefined, quantity: l.quantity })),
    totalMinor,
    payOnDeliveryMinor,
  };
}

/** Один и тот же город, служба, корзина и деньги → один и тот же ответ (ключ кэша). */
export function estimateKey(req: NpEstimateRequest): string {
  const items = req.items
    .map((i) => `${i.productId}:${i.variantId ?? ""}:${i.quantity}`)
    .sort()
    .join(",");
  return `${req.cityRef}|${req.serviceType}|${req.totalMinor}|${req.payOnDeliveryMinor}|${items}`;
}

/**
 * Что напечатать: одна цифра (доставка, коробка и — если часть платят при получении — комиссия за перевод,
 * уже сложенные сервером) или null, когда подсказки нет. `withCodFee` — цифра включает комиссию.
 */
export function estimateAmounts(e: NpEstimateResponse | null | undefined): { deliveryMinor: number; withCodFee: boolean } | null {
  if (!e || !e.available || e.deliveryMinor == null || e.deliveryMinor <= 0) return null;
  return { deliveryMinor: e.deliveryMinor, withCodFee: (e.codFeeMinor ?? 0) > 0 };
}
