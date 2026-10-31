"use client";

/**
 * Карта отделений НП без вёрстки и без Leaflet: константы, «куда смотреть» и загрузка отделений по окну карты.
 * Вид (чипы, рамка, пины, лист подтверждения) и сама карта — у приложений; общие части Leaflet — parts.tsx.
 */
import { withSaneCoords, type NpCategoryFilter } from "@shop/core/np-geo";
import type { NpWarehouse } from "@shop/core/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CheckoutApi } from "../../checkout/api";

export const UA_CENTER: [number, number] = [49.0, 31.3];
export const UA_ZOOM = 6;
/** Масштаб, на котором показано выбранное отделение (с него кластеризация выключена). */
export const BRANCH_ZOOM = 17;

export type MapCategory = NpCategoryFilter;

export const CAT_TABS: { key: MapCategory; labelKey: "np.cat.all" | "np.cat.branch" | "np.cat.postomat" | "np.cat.point" }[] = [
  { key: "all", labelKey: "np.cat.all" },
  { key: "branch", labelKey: "np.cat.branch" },
  { key: "postomat", labelKey: "np.cat.postomat" },
  { key: "point", labelKey: "np.cat.point" },
];

export interface MapFocus {
  /** Меняется при каждом запросе, чтобы одно место можно было навести дважды. */
  key: number;
  center?: [number, number];
  /** По умолчанию BRANCH_ZOOM (или ближе, если карта уже ближе). */
  zoom?: number;
  bounds?: [[number, number], [number, number]];
}

/** Углы окна карты — то, что нужно запросу (Leaflet `LatLngBounds` подходит как есть). */
export interface MapBounds {
  getSouthWest(): { lat: number; lng: number };
  getNorthEast(): { lat: number; lng: number };
}

const BBOX_DEBOUNCE_MS = 350;
const BBOX_LIMIT = 1500;

/**
 * Отделения в окне карты: запрос с дебаунсом при каждом сдвиге, применяется только САМЫЙ НОВЫЙ ответ (медленный
 * ответ для старого окна заменял пины города, к которому карта только что перелетела). Смена категории перечитывает
 * текущее окно. Выбранное отделение добавляется в пины, даже пока ответа для окна нет, — оно подсвечено сразу.
 */
export function useWarehouseMapData(api: Pick<CheckoutApi, "npWarehousesBbox">, selected: NpWarehouse | null) {
  const [category, setCategory] = useState<MapCategory>("all");
  const [items, setItems] = useState<NpWarehouse[]>([]);
  const boundsRef = useRef<MapBounds | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const fetchBox = useCallback(
    (b: MapBounds) => {
      boundsRef.current = b;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        const mine = ++seq.current;
        api
          .npWarehousesBbox({ minLat: sw.lat, maxLat: ne.lat, minLng: sw.lng, maxLng: ne.lng, category, limit: BBOX_LIMIT })
          .then((list) => {
            if (mine === seq.current) setItems(list);
          })
          .catch(() => {
            if (mine === seq.current) setItems([]);
          });
      }, BBOX_DEBOUNCE_MS);
    },
    [api, category],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Перечитать текущее окно, когда сменился фильтр категории (`fetchBox` меняется вместе с ним).
  useEffect(() => {
    if (boundsRef.current) fetchBox(boundsRef.current);
  }, [fetchBox]);

  const pins = useMemo(() => {
    const list = items.map(withSaneCoords);
    if (selected && !list.some((w) => w.ref === selected.ref)) list.push(withSaneCoords(selected));
    return list;
  }, [items, selected]);

  return { category, setCategory, fetchBox, pins };
}
