"use client";

/**
 * Состояние блока доставки checkout v2 — одно на сайт и Mini App: вкладка, получатель, адрес курьера и выбор НП
 * (`useNpSelection`: город, точка, кадр карты, «из прошлого заказа»), плюс подстановка из прошлого заказа по ref.
 * Живёт в экране оформления, чтобы пережить переход между шагами Mini App.
 */
import type { NpWarehouse } from "@shop/core/types";
import { useState } from "react";
import type { CheckoutApi } from "../checkout/api";
import type { OrderNpFields } from "./contract";
import { draftFromOrder, findWarehouseByRef, type DeliveryDraft } from "./draft";
import { useNpSelection } from "./np-selection";
import { EMPTY_COURIER, EMPTY_RECIPIENT, recipientLine, type CourierAddress, type Recipient } from "./recipient";
import { DELIVERY_TABS, keepsWarehouseOnTab, tabForWarehouse, type DeliveryTab } from "./tabs";

/** Прошлый заказ для подстановки (поля master + checkout v2). */
export type LastOrderForPrefill = OrderNpFields & {
  customerName?: string | null;
  deliveryMethod?: "NOVA_POSHTA" | "PICKUP" | null;
  npCityRef?: string | null;
  npCityName?: string | null;
  npWarehouseRef?: string | null;
  npWarehouseName?: string | null;
};

export function useDeliveryDraft(api: Pick<CheckoutApi, "npCities" | "npWarehouses">, tabs: readonly DeliveryTab[] = DELIVERY_TABS) {
  const np = useNpSelection(api);
  const [rawTab, setRawTab] = useState<DeliveryTab>("WAREHOUSE");
  const [recipient, setRecipient] = useState<Recipient>(EMPTY_RECIPIENT);
  const [courier, setCourier] = useState<CourierAddress>(EMPTY_COURIER);
  // Магазин выключил службу (флаги пришли позже) — первая доступная вкладка.
  const tab = tabs.includes(rawTab) ? rawTab : (tabs[0] ?? "WAREHOUSE");
  const draft: DeliveryDraft = { tab, city: np.city, warehouse: np.warehouse, courier, recipient };

  /** Вкладка выбрана покупателем; точка другого типа (відділення ↔ поштомат) сбрасывается, город остаётся. */
  function chooseTab(next: DeliveryTab) {
    np.touched.current = true;
    setRawTab(next);
    if (np.warehouse && !keepsWarehouseOnTab(np.warehouse, next)) np.chooseWarehouse(null);
  }

  /** Точка выбрана в поле или на карте: поштомат на «Відділенні» переводит на «Поштомат» и наоборот. */
  function chooseWarehouse(w: NpWarehouse | null) {
    if (w && (tab === "WAREHOUSE" || tab === "POSTOMAT")) setRawTab(tabForWarehouse(w));
    np.chooseWarehouse(w);
  }

  /**
   * Подстановка из прошлого заказа: получатель (если поля пусты), вкладка, адрес курьера, город и точка по ref
   * (точку ищем в списке её города; закрыта — покупатель выберет заново). Покупатель уже трогал выбор — отступаем.
   * `focusMap`: Mini App сразу наводит карту на найденную точку.
   */
  function applyLastOrder(o: LastOrderForPrefill, focusMap: boolean) {
    const last = draftFromOrder(o);
    setRecipient((r) => (recipientLine(r) ? r : last.recipient));
    if (np.touched.current) return;
    setRawTab(last.tab);
    if (last.tab === "PICKUP" || !last.city) return;
    const city = last.city;
    if (last.tab === "DOORS") {
      setCourier((c) => (c.streetName || c.building ? c : last.courier));
      np.applyLastCity(city);
      return;
    }
    np.fetchWarehouses(city.ref)
      .then((list) => {
        const w = findWarehouseByRef(list, o.npWarehouseRef, o.npWarehouseName);
        if (!w || np.touched.current) return;
        // Заказы до checkout v2 без службы: вкладку определяет найденная точка (поштомат → «Поштомат»).
        setRawTab(tabForWarehouse(w));
        np.applyLast({ city, warehouse: { ...w, cityRef: w.cityRef ?? city.ref, cityName: w.cityName ?? city.name } }, focusMap);
      })
      .catch(() => {
        /* не критично: покупатель выберет сам */
      });
  }

  return {
    draft,
    tab,
    chooseTab,
    recipient,
    setRecipient,
    courier,
    setCourier,
    np,
    chooseCity: np.chooseCity,
    chooseWarehouse,
    applyLastOrder,
  };
}

export type DeliveryDraftState = ReturnType<typeof useDeliveryDraft>;
