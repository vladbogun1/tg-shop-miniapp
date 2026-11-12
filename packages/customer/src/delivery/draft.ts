/**
 * Всё, что собирает блок доставки оформления, и та часть тела POST /api/orders, которую он заполняет.
 * Сервер (Checkout / DeliveryAddressCheck) остаётся судьёй — клиент повторяет правила для быстрого ответа.
 */
import type { DeliveryMethod, NpCity, NpWarehouse } from "@shop/core/types";
import type { NpServiceType, OrderNpFields } from "./contract";
import {
  courierOk,
  EMPTY_COURIER,
  recipientCustomerName,
  recipientOfOrder,
  type CourierAddress,
  type Recipient,
} from "./recipient";
import { tabMethod, tabOfOrder, warehouseFitsTab, type DeliveryTab } from "./tabs";

export interface DeliveryDraft {
  tab: DeliveryTab;
  city: Pick<NpCity, "ref" | "name"> | null;
  warehouse: NpWarehouse | null;
  courier: CourierAddress;
  recipient: Recipient;
}

/** Поля POST /api/orders, которые заполняет доставка. */
export interface OrderDeliveryFields {
  customerName: string;
  deliveryMethod: DeliveryMethod;
  npCityRef?: string;
  npCityName?: string;
  npWarehouseRef?: string;
  npWarehouseName?: string;
  npServiceType?: NpServiceType;
  npStreetRef?: string;
  npStreetName?: string;
  npBuilding?: string;
  npFlat?: string;
  recipientLastName: string;
  recipientFirstName: string;
  recipientMiddleName?: string;
}

/** Город черновика НП (выбранная точка несёт свой). */
export function draftCity(d: Pick<DeliveryDraft, "tab" | "city" | "warehouse">): { ref: string; name: string } | null {
  if (d.tab === "WAREHOUSE" || d.tab === "POSTOMAT") {
    const ref = d.warehouse?.cityRef ?? d.city?.ref;
    return ref ? { ref, name: d.warehouse?.cityName ?? d.city?.name ?? "" } : null;
  }
  return d.city ? { ref: d.city.ref, name: d.city.name } : null;
}

/** Доставка заполнена: точка подходящего типа для відділення/поштомата, город + адрес для курьера. */
export function deliveryOk(d: Pick<DeliveryDraft, "tab" | "city" | "warehouse" | "courier">): boolean {
  switch (d.tab) {
    case "PICKUP":
      return true;
    case "DOORS":
      return !!d.city && courierOk(d.courier);
    default:
      return !!d.warehouse && warehouseFitsTab(d.warehouse, d.tab) && !!draftCity(d);
  }
}

function trimmed(v: string): string | undefined {
  return v.trim() || undefined;
}

/** Поля для POST /api/orders. Звать, когда получатель и доставка заполнены. */
export function buildDeliveryFields(d: DeliveryDraft): OrderDeliveryFields {
  const r = d.recipient;
  const base: OrderDeliveryFields = {
    customerName: recipientCustomerName(r),
    deliveryMethod: tabMethod(d.tab),
    recipientLastName: r.lastName.trim(),
    recipientFirstName: r.firstName.trim(),
    recipientMiddleName: trimmed(r.middleName),
  };
  if (d.tab === "PICKUP") return base;
  const city = draftCity(d);
  base.npServiceType = d.tab;
  base.npCityRef = city?.ref;
  base.npCityName = city?.name || undefined;
  if (d.tab === "DOORS") {
    base.npStreetRef = trimmed(d.courier.streetRef);
    base.npStreetName = d.courier.streetName.trim();
    base.npBuilding = d.courier.building.trim();
    base.npFlat = trimmed(d.courier.flat);
  } else {
    base.npWarehouseRef = d.warehouse?.ref;
    base.npWarehouseName = d.warehouse?.description;
  }
  return base;
}

type PastOrder = OrderNpFields & {
  customerName?: string | null;
  deliveryMethod?: DeliveryMethod | null;
  npCityRef?: string | null;
  npCityName?: string | null;
};

/**
 * Прошлый заказ как черновик для подстановки: вкладка, получатель, адрес курьера и город по ref
 * (курьеру отделение не нужно). Отделение ищется отдельно по ref в списке города — `findWarehouseByRef`.
 */
export function draftFromOrder(o: PastOrder): Pick<DeliveryDraft, "tab" | "recipient" | "courier" | "city"> {
  const tab = tabOfOrder(o);
  return {
    tab,
    recipient: recipientOfOrder(o),
    city: o.npCityRef ? { ref: o.npCityRef, name: o.npCityName ?? "" } : null,
    courier:
      tab === "DOORS"
        ? { streetRef: "", streetName: o.npStreetName ?? "", building: o.npBuilding ?? "", flat: o.npFlat ?? "" }
        : EMPTY_COURIER,
  };
}

/** Отделение прошлого заказа в списке его города: по ref, иначе по названию. Нет — null (закрыто). */
export function findWarehouseByRef(
  list: NpWarehouse[],
  ref: string | null | undefined,
  description: string | null | undefined,
): NpWarehouse | null {
  return (ref ? list.find((w) => w.ref === ref) : undefined) ?? (description ? list.find((w) => w.description === description) : undefined) ?? null;
}
