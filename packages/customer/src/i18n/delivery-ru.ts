/**
 * Общие тексты доставки вне оформления (корзина, список и страница заказа: посылка, «доставка отдельно») — по-русски.
 * Подмешивается в `sharedRu` спредом. Тексты самого оформления — `checkout-delivery-ru.ts` (грузятся только там).
 */

export const deliveryRu = {
  "cart.deliveryNote": "Доставку оплачиваете отдельно Новой почте при получении — в сумму заказа она не входит.",
  "parcel.title": "Посылка",
  "parcel.track": "Отследить",
  "parcel.cod": "К оплате при получении: {amount}",
  "parcel.stage.CREATED": "Готовится к отправке",
  "parcel.stage.IN_TRANSIT": "В пути",
  "parcel.stage.ARRIVED": "Прибыла — можно забирать",
  "parcel.stage.RECEIVED": "Получена",
  "parcel.stage.REFUSED": "Отказ от получения",
  "parcel.stage.RETURNING": "Возвращается отправителю",
  "parcel.stage.CANCELLED": "Отправление отменено",
  "parcel.stage.NOT_FOUND": "Уточняем статус",
  "delivery.cost.note": "Сумма — без доставки: доставку оплачиваете отдельно Новой почте при получении, мы её не берём.",
};
