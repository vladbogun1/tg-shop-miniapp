"use client";

import { useRouter } from "next/navigation";
import { usePlaceOrder as useSharedPlaceOrder, type PlaceOrderInput } from "@shop/customer/checkout/use-place-order";
import { trackOrderCreated } from "@/lib/analytics";
import { useI18n } from "@/i18n/context";
import { customerApi } from "@/lib/api";
import { cartAfterOrder, flushCart } from "@/features/cart";
import { telegramPlatform } from "@/platform/telegram/platform";
import { useInvalidateMe } from "../queries";

/**
 * Submit (the scenario is shared with the site: @shop/customer/checkout/use-place-order). What is
 * Mini App's own: the cart store, analytics and the way on to the order page.
 */
export function usePlaceOrder(input: PlaceOrderInput & { setPromoCode: (code: string) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const invalidateMe = useInvalidateMe();
  return useSharedPlaceOrder(
    {
      api: customerApi.checkout,
      platform: telegramPlatform,
      t,
      beforePlace: flushCart,
      dropPromo: () => input.setPromoCode(""),
      onPlaced(created, orderedKeys) {
        trackOrderCreated(created.orderId);
        cartAfterOrder(orderedKeys);
        invalidateMe();
        // The "order created" step: the order page shows the amount, the 24 h countdown,
        // «Оплатити» (the in-app monobank sheet) and «Скасувати» (`?created=1`,
        // features/order/ui/payment/OrderPayment). Nothing opens by itself any more.
        router.replace(
          created.amountDueMinor > 0 ? `/account/orders/${created.orderId}?created=1` : `/account/orders/${created.orderId}`,
        );
      },
    },
    input,
  );
}
