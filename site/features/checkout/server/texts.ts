import "server-only";

/**
 * Тексты оформления одного языка (язык из URL) — страница отдаёт их клиенту пропсом через CheckoutTextsProvider.
 * Так в чанк оформления не попадают словари всех трёх языков (бюджет бандла), и язык не мигает: тексты приходят
 * вместе с HTML.
 */
import type { Locale } from "@shop/core/i18n";
import { CHECKOUT_TEXTS } from "@shop/customer/i18n/checkout-delivery";
import { ORDER_DELIVERY_TEXTS } from "@shop/customer/i18n/order-delivery";
import type { CheckoutTexts } from "@/i18n/checkout";

export function checkoutTextsOf(locale: Locale): CheckoutTexts {
  return { ...ORDER_DELIVERY_TEXTS[locale], ...CHECKOUT_TEXTS[locale] };
}
