/**
 * Правка получателя и доставки: что изменилось и можно ли сохранять (без React).
 * Новая Почта: отделение / почтомат / курьер (улица, дом, квартира) и получатель для ТТН по частям.
 */
import type { AdminOrderDetail, DeliveryPatch } from "../api";

export interface Place {
  ref: string;
  name: string;
}

/** Улица: `ref` — из справочника НП, null — введена вручную. */
export interface StreetPick {
  ref: string | null;
  name: string;
}

export type NpService = "WAREHOUSE" | "POSTOMAT" | "DOORS";

export const NP_SERVICES: { value: NpService; label: string }[] = [
  { value: "WAREHOUSE", label: "Відділення" },
  { value: "POSTOMAT", label: "Поштомат" },
  { value: "DOORS", label: "Кур'єр" },
];

type DeliveryOrder = Pick<
  AdminOrderDetail,
  | "customerName"
  | "phone"
  | "deliveryMethod"
  | "npCityRef"
  | "npCityName"
  | "npWarehouseRef"
  | "npWarehouseName"
  | "npServiceType"
  | "npStreetName"
  | "npBuilding"
  | "npFlat"
  | "recipientLastName"
  | "recipientFirstName"
  | "recipientMiddleName"
>;

/** Всё, что правится в окне. */
export interface DeliveryDraft {
  name: string;
  phone: string;
  city: Place | null;
  wh: Place | null;
  service: NpService;
  street: StreetPick | null;
  building: string;
  flat: string;
  last: string;
  first: string;
  middle: string;
}

export function placeOf(ref: string | null | undefined, name: string | null | undefined): Place | null {
  return ref && name ? { ref, name } : null;
}

export function serviceOf(order: Pick<DeliveryOrder, "npServiceType">): NpService {
  const v = (order.npServiceType ?? "").toUpperCase();
  return v === "POSTOMAT" || v === "DOORS" ? v : "WAREHOUSE";
}

export function draftOf(order: DeliveryOrder): DeliveryDraft {
  return {
    name: order.customerName ?? "",
    phone: order.phone ?? "",
    city: placeOf(order.npCityRef, order.npCityName),
    wh: placeOf(order.npWarehouseRef, order.npWarehouseName),
    service: serviceOf(order),
    street: order.npStreetName ? { ref: null, name: order.npStreetName } : null,
    building: order.npBuilding ?? "",
    flat: order.npFlat ?? "",
    last: order.recipientLastName ?? "",
    first: order.recipientFirstName ?? "",
    middle: order.recipientMiddleName ?? "",
  };
}

export const MIN_PHONE_DIGITS = 10;

export function phoneDigits(phone: string): number {
  return phone.replace(/\D/g, "").length;
}

const same = (typed: string, saved: string | null | undefined) => typed.trim() === (saved ?? "");

/** Фамилия / имя / отчество для НП изменились. */
export function recipientChanged(order: DeliveryOrder, d: DeliveryDraft): boolean {
  return !same(d.last, order.recipientLastName) || !same(d.first, order.recipientFirstName) || !same(d.middle, order.recipientMiddleName);
}

function doorsChanged(order: DeliveryOrder, d: DeliveryDraft): boolean {
  return (d.street?.name ?? "") !== (order.npStreetName ?? "") || !same(d.building, order.npBuilding) || !same(d.flat, order.npFlat);
}

/** Тип доставки, город или сам адрес (отделение / улица-дом-квартира) изменились. */
export function addressChanged(order: DeliveryOrder, d: DeliveryDraft): boolean {
  if (d.service !== serviceOf(order) || (!!d.city && d.city.ref !== order.npCityRef)) return true;
  return d.service === "DOORS" ? doorsChanged(order, d) : !!d.wh && d.wh.ref !== order.npWarehouseRef;
}

/** Адрес под выбранный тип; город уходит всегда — сервер заменяет адрес целиком. */
function addressPatch(d: DeliveryDraft & { city: Place }): DeliveryPatch {
  const patch: DeliveryPatch = { npServiceType: d.service, npCityRef: d.city.ref, npCityName: d.city.name };
  if (d.service !== "DOORS") return d.wh ? { ...patch, npWarehouseRef: d.wh.ref, npWarehouseName: d.wh.name } : patch;
  if (d.street?.ref) patch.npStreetRef = d.street.ref;
  if (d.street) patch.npStreetName = d.street.name;
  return { ...patch, npBuilding: d.building.trim(), npFlat: d.flat.trim() };
}

/** Только изменённые поля. */
export function buildDeliveryPatch(order: DeliveryOrder, d: DeliveryDraft): DeliveryPatch {
  let patch: DeliveryPatch = {};
  if (!same(d.name, order.customerName)) patch.customerName = d.name.trim();
  if (!same(d.phone, order.phone)) patch.phone = d.phone.trim();
  if (order.deliveryMethod !== "NOVA_POSHTA") return patch;
  if (recipientChanged(order, d)) {
    patch = { ...patch, recipientLastName: d.last.trim(), recipientFirstName: d.first.trim(), recipientMiddleName: d.middle.trim() };
  }
  if (d.city && addressChanged(order, d)) patch = { ...patch, ...addressPatch({ ...d, city: d.city }) };
  return patch;
}

/** Фамилия и имя для НП стёрты. */
export function recipientMissing(order: DeliveryOrder, d: DeliveryDraft): boolean {
  return recipientChanged(order, d) && (!d.last.trim() || !d.first.trim());
}

function addressInvalid(order: DeliveryOrder, d: DeliveryDraft): boolean {
  if (!d.city) return true;
  const addressOk = d.service === "DOORS" ? !!d.street?.name.trim() && !!d.building.trim() : !!d.wh;
  return !addressOk || recipientMissing(order, d);
}

export function isDeliveryInvalid(order: DeliveryOrder, d: DeliveryDraft): boolean {
  if (!d.name.trim() || phoneDigits(d.phone) < MIN_PHONE_DIGITS) return true;
  return order.deliveryMethod === "NOVA_POSHTA" && addressInvalid(order, d);
}

/** Текстовые поля окна (react-hook-form); город, отделение, тип и улица — выбор из справочника. */
export type DeliveryText = Pick<DeliveryDraft, "name" | "phone" | "building" | "flat" | "last" | "first" | "middle">;
