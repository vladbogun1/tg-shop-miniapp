/**
 * «Новый заказ этому покупателю»: с чем открывается окно ручного заказа — покупатель и адрес из его заказа
 * (из карточки заказа или последний заказ из профиля). Товары и оплата не переносятся: это новая продажа.
 */
import type { AdminOrderDetail } from "../api";
import { placeOf, serviceOf } from "./delivery-edit";
import { defaultChannel, EMPTY_NEW_ORDER, type Delivery, type NewOrderValues } from "./new-order";

/** Откуда открыто окно: пустое (кнопка на доске), из заказа или из профиля покупателя. */
export type NewOrderFrom = { orderId: string } | { tgId: number; name: string };

export interface NewOrderPrefill {
  values: NewOrderValues;
  /**
   * Старый заказ, где адрес НП записан только текстом (до справочника): показать его, чтобы выбрать город
   * и отделение из справочника. null — подсказка не нужна.
   */
  legacyAddress: string | null;
}

type SourceOrder = Pick<
  AdminOrderDetail,
  | "customerName"
  | "phone"
  | "tgUserId"
  | "deliveryMethod"
  | "npServiceType"
  | "npCityRef"
  | "npCityName"
  | "npWarehouseRef"
  | "npWarehouseName"
  | "npStreetName"
  | "npBuilding"
  | "npFlat"
  | "comment"
>;

function addressOf(o: SourceOrder): Pick<NewOrderValues, "service" | "city" | "wh" | "street" | "building" | "flat"> {
  const service = serviceOf(o);
  return {
    service,
    city: placeOf(o.npCityRef, o.npCityName),
    wh: service === "DOORS" ? null : placeOf(o.npWarehouseRef, o.npWarehouseName),
    street: service === "DOORS" && o.npStreetName ? { ref: null, name: o.npStreetName } : null,
    building: service === "DOORS" ? (o.npBuilding ?? "") : "",
    flat: service === "DOORS" ? (o.npFlat ?? "") : "",
  };
}

function legacyAddressOf(o: SourceOrder, delivery: Delivery): string | null {
  if (delivery !== "NOVA_POSHTA" || o.npCityRef) return null;
  const text = [o.npCityName, o.npWarehouseName, o.comment].map((x) => x?.trim()).filter(Boolean).join(" · ");
  return text || null;
}

/** Покупатель и доставка из его заказа; `tgId` — если заказ без Telegram id, а покупатель известен (профиль). */
export function prefillFromOrder(o: SourceOrder, tgId?: number): NewOrderPrefill {
  const delivery: Delivery = o.deliveryMethod === "PICKUP" ? "PICKUP" : "NOVA_POSHTA";
  const id = o.tgUserId ?? tgId;
  return {
    values: {
      ...EMPTY_NEW_ORDER,
      name: o.customerName ?? "",
      phone: o.phone ?? "",
      tgId: id ? String(id) : "",
      delivery,
      channel: defaultChannel(delivery),
      ...addressOf(o),
    },
    legacyAddress: legacyAddressOf(o, delivery),
  };
}

/** Покупатель без заказов: только имя из Telegram и его id — телефон и адрес вводятся. */
export function prefillForCustomer(name: string, tgId: number): NewOrderPrefill {
  return { values: { ...EMPTY_NEW_ORDER, name, tgId: String(tgId) }, legacyAddress: null };
}
