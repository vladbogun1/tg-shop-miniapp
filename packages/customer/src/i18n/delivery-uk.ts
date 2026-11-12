/** Общие тексты доставки на любом экране — Ukrainian. Те же ключи, что в `delivery-ru.ts`. */
import type { deliveryRu } from "./delivery-ru";

export const deliveryUk: Record<keyof typeof deliveryRu, string> = {
  "cart.deliveryNote": "Доставку сплачуєте окремо Новій пошті при отриманні — у суму замовлення вона не входить.",
  "parcel.stage.CREATED": "Готується до відправлення",
  "parcel.stage.IN_TRANSIT": "У дорозі",
  "parcel.stage.ARRIVED": "Прибула — можна забирати",
  "parcel.stage.RECEIVED": "Отримана",
  "parcel.stage.REFUSED": "Відмова від отримання",
  "parcel.stage.RETURNING": "Повертається відправнику",
  "parcel.stage.CANCELLED": "Відправлення скасовано",
  "parcel.stage.NOT_FOUND": "Уточнюємо статус",
};
