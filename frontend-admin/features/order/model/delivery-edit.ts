/** Правка получателя и доставки: что изменилось и можно ли сохранять (без React). */
import type { AdminOrderDetail, DeliveryPatch } from "../api";

export interface Place {
  ref: string;
  name: string;
}

type DeliveryOrder = Pick<
  AdminOrderDetail,
  "customerName" | "phone" | "deliveryMethod" | "npCityRef" | "npCityName" | "npWarehouseRef" | "npWarehouseName"
>;

export function placeOf(ref: string | null | undefined, name: string | null | undefined): Place | null {
  return ref && name ? { ref, name } : null;
}

export const MIN_PHONE_DIGITS = 10;

export function phoneDigits(phone: string): number {
  return phone.replace(/\D/g, "").length;
}

/** Только изменённые поля; адрес — когда выбраны и город, и отделение и хотя бы одно из них новое. */
export function buildDeliveryPatch(order: DeliveryOrder, name: string, phone: string, city: Place | null, wh: Place | null): DeliveryPatch {
  const patch: DeliveryPatch = {};
  if (name.trim() !== (order.customerName ?? "")) patch.customerName = name.trim();
  if (phone.trim() !== (order.phone ?? "")) patch.phone = phone.trim();
  const isNp = order.deliveryMethod === "NOVA_POSHTA";
  if (isNp && city && wh && (wh.ref !== order.npWarehouseRef || city.ref !== order.npCityRef)) {
    patch.npCityRef = city.ref;
    patch.npCityName = city.name;
    patch.npWarehouseRef = wh.ref;
    patch.npWarehouseName = wh.name;
  }
  return patch;
}

export function isDeliveryInvalid(isNp: boolean, name: string, phone: string, city: Place | null, wh: Place | null): boolean {
  return !name.trim() || phoneDigits(phone) < MIN_PHONE_DIGITS || (isNp && (!city || !wh));
}
