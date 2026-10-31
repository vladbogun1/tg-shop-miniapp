import type { DeliveryMethod } from "@shop/core/types";

/** Подписи способов доставки в админке (заказ и профиль покупателя). */
export const DELIVERY_LABEL: Record<DeliveryMethod, string> = {
  NOVA_POSHTA: "Нова Пошта",
  PICKUP: "Самовывоз",
};
