/** Тексты доставки страницы заказа и оформления — English. Те же ключи, что в `order-delivery-ru.ts`. */
import type { orderDeliveryRu } from "./order-delivery-ru";

export const orderDeliveryEn: Record<keyof typeof orderDeliveryRu, string> = {
  "parcel.title": "Parcel",
  "parcel.track": "Track",
  "parcel.cod": "To pay on receipt: {amount}",
  "delivery.cost.note": "The total excludes shipping: you pay it separately to Nova Poshta on receipt, not to us.",
};
