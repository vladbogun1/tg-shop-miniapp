/** Адрес доставки и получатель для НП — строками для карточки заказа (без React). */
import type { AdminOrderDetail } from "../api";

type AddressOrder = Pick<AdminOrderDetail, "npCityName" | "npWarehouseName" | "npServiceType" | "npStreetName" | "npBuilding" | "npFlat">;

/** Отделение / почтомат — «Город, Отделение №1»; курьер — «Город, улица, д. 5, кв. 7». */
export function deliveryAddress(o: AddressOrder): string {
  const courier = o.npServiceType === "DOORS";
  const street = [o.npStreetName, o.npBuilding && `д. ${o.npBuilding}`, o.npFlat && `кв. ${o.npFlat}`].filter(Boolean).join(", ");
  return [o.npCityName, courier ? street : o.npWarehouseName].filter(Boolean).join(", ");
}

/** «Фамилия Имя Отчество» для ТТН, если он отличается от ФИО заказа; иначе null. */
export function npRecipientIfDifferent(
  o: Pick<AdminOrderDetail, "customerName" | "recipientLastName" | "recipientFirstName" | "recipientMiddleName">,
): string | null {
  const name = [o.recipientLastName, o.recipientFirstName, o.recipientMiddleName].filter(Boolean).join(" ");
  return name && name !== o.customerName ? name : null;
}
