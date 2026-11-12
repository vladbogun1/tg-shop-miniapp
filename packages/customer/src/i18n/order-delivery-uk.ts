/** Тексты доставки страницы заказа и оформления — Ukrainian. Те же ключи, что в `order-delivery-ru.ts`. */
import type { orderDeliveryRu } from "./order-delivery-ru";

export const orderDeliveryUk: Record<keyof typeof orderDeliveryRu, string> = {
  "parcel.title": "Посилка",
  "parcel.track": "Відстежити",
  "parcel.cod": "До сплати під час отримання: {amount}",
  "delivery.cost.note": "Сума — без доставки: доставку сплачуєте окремо Новій пошті при отриманні, ми її не беремо.",
};
