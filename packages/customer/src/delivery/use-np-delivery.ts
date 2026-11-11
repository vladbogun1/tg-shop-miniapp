"use client";

/**
 * React-хуки блока доставки checkout v2 без вёрстки — одни на сайт и Mini App (правила — tabs/recipient/draft/estimate):
 *  - `useNpConfig`: какие вкладки показать; ошибка/старый бэкенд — все вкладки;
 *  - `useNpStreets`: поиск улиц для курьера, ≥ 2 букв, с задержкой; сбой — «впишіть вручну»;
 *  - `useDeliveryEstimate`: «≈ N ₴» с задержкой, один кэш на сессию; сбой/таймаут — null, оформлению не мешает;
 *  - `useNpMapPick`: точка на карте — только кандидат до «Обрати це відділення».
 */
import { QUERY_PRESETS } from "@shop/core/query";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { CheckoutApi } from "../checkout/api";
import { checkoutKeys, DIRECTORY_STALE_MS } from "../checkout/keys";
import type { NpEstimateRequest, NpEstimateResponse, NpStreet } from "./contract";
import { estimateKey } from "./estimate";
import { useDebounced } from "./np-search";
import { availabilityOf, availableTabs } from "./tabs";

type NpApi = Pick<CheckoutApi, "npConfig" | "npStreets" | "npEstimate">;

/** Вкладки доставки по флагам магазина; пока флагов нет — все. */
export function useNpConfig(api: Pick<NpApi, "npConfig">) {
  const q = useQuery({
    queryKey: checkoutKeys.npConfig(),
    staleTime: QUERY_PRESETS.static.staleTime,
    retry: false,
    queryFn: () => api.npConfig(),
  });
  const config = q.data ?? null;
  return { config, tabs: availableTabs(availabilityOf(config)), estimateEnabled: config?.estimateEnabled !== false };
}

const NO_STREETS: NpStreet[] = [];

export interface NpStreets {
  items: NpStreet[];
  loading: boolean;
  /** Текст достаточно длинный (≥ 2 букв) — список может быть открыт. */
  searching: boolean;
  /** Поиск не удался: сказать, улицу всё равно можно вписать руками. */
  failed: boolean;
}

export function useNpStreets(api: Pick<NpApi, "npStreets">, cityRef: string | null | undefined, text: string, enabled = true): NpStreets {
  const trimmed = text.trim();
  const term = useDebounced(trimmed, 300);
  const on = enabled && !!cityRef && term.length >= 2;
  const q = useQuery({
    queryKey: checkoutKeys.npStreets(cityRef ?? "", term.toLowerCase()),
    enabled: on,
    staleTime: DIRECTORY_STALE_MS,
    retry: false,
    // Не больше 10 подсказок: сервер тоже режет, это держит список коротким при любом ответе.
    queryFn: async () => (await api.npStreets(cityRef!, term)).slice(0, 10),
  });
  const searching = enabled && !!cityRef && trimmed.length >= 2;
  if (!searching) return { items: NO_STREETS, loading: false, searching: false, failed: false };
  const ready = on && term === trimmed && !q.isFetching;
  return { items: ready ? (q.data ?? NO_STREETS) : NO_STREETS, loading: !ready, searching: true, failed: ready && q.isError };
}

const UNAVAILABLE: NpEstimateResponse = { available: false };

/**
 * «≈ N ₴» для текущей корзины, города, службы и денег. `req` null — считать нечего (самовывоз, нет города).
 * Ответ «недоступно» и любая ошибка дают `estimate: null`; запрос не повторяется (сервер держит отказ 60 с сам).
 */
export function useDeliveryEstimate(api: Pick<NpApi, "npEstimate">, req: NpEstimateRequest | null, enabled = true, debounceMs = 400) {
  const key = req && enabled ? estimateKey(req) : "";
  const debounced = useDebounced(key, debounceMs);
  // Запрос для текущего ключа (объект `req` пересобирается на каждом рендере, ключ — нет).
  const [latest, setLatest] = useState<{ key: string; req: NpEstimateRequest | null }>({ key: "", req: null });
  if (latest.key !== key) setLatest({ key, req });
  const q = useQuery({
    queryKey: checkoutKeys.npEstimate(debounced),
    enabled: !!debounced && latest.key === debounced && !!latest.req,
    staleTime: DIRECTORY_STALE_MS,
    retry: false,
    queryFn: () => api.npEstimate(latest.req!).catch(() => UNAVAILABLE),
  });
  if (!key) return { estimate: null, loading: false };
  const current = debounced === key && q.data;
  if (current) return { estimate: current.available ? current : null, loading: false };
  return { estimate: null, loading: q.isFetching || debounced !== key };
}

export interface NpMapPick<W extends { ref: string }> {
  /** Точка, нажатая на карте и ещё не подтверждённая (null — ничего не ждёт). */
  pending: W | null;
  /** Что подсветить на карте: ждущую точку, иначе выбранную. */
  shown: W | null;
  pick: (w: W) => void;
  confirm: () => void;
  cancel: () => void;
}

/**
 * Выбор на карте: нажатая точка — только кандидат до «Обрати це відділення», случайное касание при прокрутке
 * не меняет адрес доставки. Повторный выбор уже выбранной точки подтверждения не требует.
 */
export function useNpMapPick<W extends { ref: string }>(selected: W | null, onConfirm: (w: W) => void): NpMapPick<W> {
  const [pending, setPending] = useState<W | null>(null);
  const waiting = pending && pending.ref !== selected?.ref ? pending : null;
  return {
    pending: waiting,
    shown: waiting ?? selected,
    pick: (w) => setPending(w),
    confirm: () => {
      if (waiting) onConfirm(waiting);
      setPending(null);
    },
    cancel: () => setPending(null),
  };
}
