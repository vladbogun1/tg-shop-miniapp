"use client";

/**
 * «Только полная оплата онлайн» для этого покупателя (админ пометил его проблемным): варианты с предоплатой
 * и наложкой ему не показываем, сервер их тоже не примет. Пока не знаем (гость, сбой, ещё грузится) — false:
 * последнее слово за сервером, который ответит ONLINE_PAYMENT_ONLY с переведённым текстом.
 */
import { useQuery } from "@tanstack/react-query";
import type { CheckoutApi } from "./api";
import { checkoutKeys } from "./keys";

export function useOnlinePaymentOnly(api: Pick<CheckoutApi, "onlinePaymentOnly">, enabled: boolean): boolean {
  const query = useQuery({
    queryKey: checkoutKeys.onlinePaymentOnly(),
    queryFn: () => api.onlinePaymentOnly(),
    enabled,
    retry: false,
  });
  return query.data === true;
}
