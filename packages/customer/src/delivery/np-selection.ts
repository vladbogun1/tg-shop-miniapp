"use client";

/**
 * Состояние выбора НП на оформлении: город, отделение, куда смотрит карта, «отделение из прошлого заказа»,
 * «покупатель уже трогал выбор» (подстановка из прошлого заказа тогда отступает). Одинаково в Mini App и на сайте.
 *
 * Живёт в экране оформления, а не в блоке доставки, чтобы пережить переход на другой шаг и назад.
 */
import type { NpCity, NpWarehouse } from "@shop/core/types";
import { npCityBounds, npLatLng } from "@shop/core/np-geo";
import { nowMs } from "@shop/core/time";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { CheckoutApi } from "../checkout/api";
import { npWarehousesQuery } from "./np-search";
import type { MapFocus } from "./map/model";

export function useNpSelection(api: Pick<CheckoutApi, "npCities" | "npWarehouses">) {
  const queryClient = useQueryClient();
  const [warehouse, setWarehouse] = useState<NpWarehouse | null>(null);
  const [city, setCity] = useState<NpCity | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  /** Отделение из прошлого заказа — компактная карточка до «Обрати інше». */
  const [warehouseFromLast, setWarehouseFromLast] = useState(false);
  // Город, чьи отделения сейчас грузятся ради кадра карты: поздний ответ для города, который покупатель уже
  // сменил, карту двигать не должен.
  const framingCity = useRef<string | null>(null);
  /** Покупатель трогал выбор доставки — подстановка из прошлого заказа отступает. */
  const touched = useRef(false);

  /** Город выбран в поле (или сброшен набором поверх). Другой город сбрасывает отделение. */
  function chooseCity(c: NpCity | null) {
    touched.current = true;
    if (c?.ref !== city?.ref) {
      setWarehouse(null);
      setWarehouseFromLast(false);
    }
    setCity(c);
    framingCity.current = c?.ref ?? null;
    if (!c) return;
    // Кадр карты на город сразу: она откроется уже там.
    queryClient
      .fetchQuery(npWarehousesQuery(api, c.ref))
      .then((whs) => {
        if (framingCity.current !== c.ref) return;
        const bounds = npCityBounds(whs);
        if (bounds) setFocus({ key: nowMs(), bounds });
      })
      .catch(() => {
        /* карта всё равно работает руками */
      });
  }

  /** Отделение выбрано в поле или на карте: выбрать, синхронизировать город, навести карту. */
  const chooseWarehouse = useCallback((w: NpWarehouse | null) => {
    touched.current = true;
    setWarehouseFromLast(false);
    setWarehouse(w);
    if (!w) return;
    if (w.cityRef) {
      setCity((c) => (c?.ref === w.cityRef ? c : { ref: w.cityRef!, name: w.cityName ?? "" }));
    }
    framingCity.current = null; // отложенный кадр города не должен утянуть карту с этого отделения
    const p = npLatLng(w);
    if (p) setFocus({ key: nowMs(), center: p });
  }, []);

  /** Список отделений города из общего кэша (для подстановки из прошлого заказа). */
  const fetchWarehouses = (ref: string) => queryClient.fetchQuery(npWarehousesQuery(api, ref));

  return {
    city,
    warehouse,
    focus,
    warehouseFromLast,
    touched,
    chooseCity,
    chooseWarehouse,
    fetchWarehouses,
    /** Подстановка из прошлого заказа. `focusMap`: Mini App сразу наводит карту на найденное отделение. */
    applyLast(found: { warehouse: NpWarehouse; city: NpCity }, focusMap: boolean) {
      setWarehouse(found.warehouse);
      setCity(found.city);
      setWarehouseFromLast(true);
      if (!focusMap) return;
      const p = npLatLng(found.warehouse);
      if (p) setFocus({ key: nowMs(), center: p });
    },
    setWarehouseFromLast,
    /** Навести карту на уже выбранное отделение («Обрати інше» на сайте). */
    focusWarehouse(w: NpWarehouse) {
      const p = npLatLng(w);
      if (p) setFocus({ key: nowMs(), center: p });
    },
  };
}
