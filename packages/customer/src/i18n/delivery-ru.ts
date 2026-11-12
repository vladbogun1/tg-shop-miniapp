/**
 * Общие тексты доставки на любом экране (корзина, стадия посылки в списке заказов) — по-русски. Подмешивается в
 * `sharedRu` спредом. Страница заказа — `order-delivery-ru.ts`, оформление — `checkout-delivery-ru.ts` (грузятся только там).
 */

export const deliveryRu = {
  "cart.deliveryNote": "Доставку оплачиваете отдельно Новой почте при получении — в сумму заказа она не входит.",
  "parcel.stage.CREATED": "Готовится к отправке",
  "parcel.stage.IN_TRANSIT": "В пути",
  "parcel.stage.ARRIVED": "Прибыла — можно забирать",
  "parcel.stage.RECEIVED": "Получена",
  "parcel.stage.REFUSED": "Отказ от получения",
  "parcel.stage.RETURNING": "Возвращается отправителю",
  "parcel.stage.CANCELLED": "Отправление отменено",
  "parcel.stage.NOT_FOUND": "Уточняем статус",
};
