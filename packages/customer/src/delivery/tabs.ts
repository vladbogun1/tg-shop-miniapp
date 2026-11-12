/**
 * Вкладки доставки checkout v2: відділення · поштомат · кур'єр · самовивіз — одинаково на сайте и в Mini App.
 * Флаги служб — GET /api/np/config; пока ответа нет или запрос упал — показываем все вкладки (сервер проверит при заказе).
 */
import type { DeliveryMethod, NpWarehouse } from "@shop/core/types";
import type { DeliveryKey, NpCheckoutConfig, NpServiceType } from "./contract";

export type DeliveryTab = DeliveryKey;

export const DELIVERY_TABS: readonly DeliveryTab[] = ["WAREHOUSE", "POSTOMAT", "DOORS", "PICKUP"];

export interface DeliveryAvailability {
  postomat: boolean;
  courier: boolean;
}

export const ALL_DELIVERIES: DeliveryAvailability = { postomat: true, courier: true };

/** Нет конфига (не загрузился, упал) — всё включено. */
export function availabilityOf(cfg: NpCheckoutConfig | null | undefined): DeliveryAvailability {
  return cfg ? { postomat: cfg.postomatEnabled !== false, courier: cfg.courierEnabled !== false } : ALL_DELIVERIES;
}

export function availableTabs(av: DeliveryAvailability = ALL_DELIVERIES): DeliveryTab[] {
  return DELIVERY_TABS.filter((t) => (t === "POSTOMAT" ? av.postomat : t === "DOORS" ? av.courier : true));
}

/** `deliveryMethod` для POST /api/orders. */
export function tabMethod(tab: DeliveryTab): DeliveryMethod {
  return tab === "PICKUP" ? "PICKUP" : "NOVA_POSHTA";
}

export function isNpTab(tab: DeliveryTab): tab is NpServiceType {
  return tab !== "PICKUP";
}

/** `kind` для GET /api/np/warehouses; null — у вкладки нет списка отделений. */
export function tabWarehouseKind(tab: DeliveryTab): "warehouse" | "postomat" | null {
  return tab === "WAREHOUSE" ? "warehouse" : tab === "POSTOMAT" ? "postomat" : null;
}

/** Вкладка выбранной точки: поштомат, выбранный на карте, переводит на «Поштомат». */
export function tabForWarehouse(w: Pick<NpWarehouse, "category">): "WAREHOUSE" | "POSTOMAT" {
  return w.category === "POSTOMAT" ? "POSTOMAT" : "WAREHOUSE";
}

/** Точка подходит вкладке (сервер может не уметь фильтр `kind` — сужаем и здесь). */
export function warehouseFitsTab(w: Pick<NpWarehouse, "category">, tab: DeliveryTab): boolean {
  if (tab === "POSTOMAT") return w.category === "POSTOMAT";
  if (tab === "WAREHOUSE") return w.category !== "POSTOMAT";
  return false;
}

/**
 * Точка остаётся при смене вкладки: на «Кур'єр» и «Самовивіз» она просто не используется (вернулся — выбор цел);
 * сбрасывается только при переходе между «Відділення» и «Поштомат», если не подходит новой вкладке.
 */
export function keepsWarehouseOnTab(w: Pick<NpWarehouse, "category">, next: DeliveryTab): boolean {
  return !(next === "WAREHOUSE" || next === "POSTOMAT") || warehouseFitsTab(w, next);
}

/** Вкладка прошлого заказа (заказы до checkout v2 без службы = відділення). */
export function tabOfOrder(o: { deliveryMethod?: DeliveryMethod | null; npServiceType?: string | null }): DeliveryTab {
  if (o.deliveryMethod === "PICKUP") return "PICKUP";
  const s = (o.npServiceType ?? "").toUpperCase();
  return s === "POSTOMAT" ? "POSTOMAT" : s === "DOORS" ? "DOORS" : "WAREHOUSE";
}
