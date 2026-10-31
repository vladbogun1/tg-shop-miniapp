"use client";

/**
 * Выбор отделения Нова пошта ТЕКСТОМ без вёрстки (поля города и отделения). Поле-автокомплит (`NpCombobox`) и подписи —
 * у приложений: Mini App и сайт рисуют его по-разному.
 *
 * Город: подсказки по /api/np/cities. Отделение: список отделений выбранного города (один запрос на город, кэш общий
 * с кадрированием карты), поиск по номеру и адресу — локально.
 * Различие приложений — `typeChips`: в Mini App список можно сузить по типу (Усі / Відділення / Поштомати).
 */
import { QUERY_PRESETS } from "@shop/core/query";
import { filterWarehouses, searchWarehouses, type NpCategoryFilter } from "@shop/core/np-geo";
import type { NpCity, NpWarehouse } from "@shop/core/types";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { CheckoutApi } from "../checkout/api";
import { checkoutKeys, DIRECTORY_STALE_MS } from "../checkout/keys";

type NpApi = Pick<CheckoutApi, "npCities" | "npWarehouses">;

/** Один элемент кэша на город: поле отделения и кадрирование карты читают один и тот же список. */
export const npWarehousesQuery = (api: NpApi, cityRef: string) => ({
  queryKey: checkoutKeys.npWarehouses(cityRef),
  staleTime: DIRECTORY_STALE_MS,
  queryFn: () => api.npWarehouses(cityRef, ""),
});

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * Текст, который следует за `external`, когда тот меняется на что-то (выбор здесь, на карте или из прошлого заказа),
 * и свободно правится между этим. Возврат к "" — человек стирает выбор, это не должно стирать набранное.
 * (Смена города пересоздаёт поле отделения.)
 */
export function useSyncedText(external: string): [string, (v: string) => void] {
  const [text, setText] = useState(external);
  const [seen, setSeen] = useState(external);
  if (seen !== external) {
    setSeen(external);
    if (external) setText(external);
  }
  return [text, setText];
}

export function useCitySearch(api: NpApi, city: NpCity | null) {
  const [q, setQ] = useSyncedText(city?.name ?? "");
  const term = useDebounced(q.trim(), 250);
  const searching = term.length >= 2 && term !== city?.name;
  const { data = [], isFetching } = useQuery({
    queryKey: checkoutKeys.npCities(term),
    enabled: searching,
    staleTime: QUERY_PRESETS.static.staleTime,
    queryFn: () => api.npCities(term),
  });
  const items = searching ? data.slice(0, 8) : [];
  return { q, setQ, items, searching, isFetching };
}

export type NpTypeFilter = Extract<NpCategoryFilter, "all" | "branch" | "postomat">;

export function useWarehouseSearch(
  api: NpApi,
  city: NpCity,
  warehouse: NpWarehouse | null,
  /** Mini App: фишки типа над списком (только если в городе есть и поштоматы, и отделения). */
  typeChips: boolean,
) {
  const [q, setQ] = useSyncedText(warehouse?.description ?? "");
  const [cat, setCat] = useState<NpTypeFilter>("all");
  const { data = [], isFetching } = useQuery(npWarehousesQuery(api, city.ref));
  const hasBoth = useMemo(
    () => typeChips && data.some((w) => w.category === "POSTOMAT") && data.some((w) => w.category !== "POSTOMAT"),
    [typeChips, data],
  );
  // Пока в поле показано выбранное отделение, список предлагает весь город.
  const typed = warehouse && q === warehouse.description ? "" : q;
  // Отдельной фишки «Пункти» нет: НП заводит много обычных отделений как POINT, поэтому «Відділення» —
  // всё, что не поштомат.
  const filtered =
    !hasBoth || cat === "all"
      ? data
      : cat === "postomat"
        ? filterWarehouses(data, "postomat")
        : data.filter((w) => w.category !== "POSTOMAT");
  const items = searchWarehouses(filtered, typed);
  return { q, setQ, items, isFetching, hasBoth, cat, setCat };
}
