"use client";

/**
 * Проверка промокода без вёрстки: «набрано → через 450 мс спросили сервер → показали ответ».
 * Одинаково в Mini App (корзина, оформление) и на сайте (оформление). Поле ввода у каждого приложения своё.
 *
 * Сначала закрытая проверка — ограниченный код реально удерживается за покупателем; если вход ещё не завершён
 * (Telegram) или сессия сайта протухла (401/403) — публичный просмотр: ответ верный, только без удержания.
 * Замена одного кода другим снимает удержание предыдущего.
 */
import { ApiError } from "@shop/core/errors";
import { QUERY_PRESETS } from "@shop/core/query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { CheckoutApi } from "./api";
import { checkoutKeys } from "./keys";

export const PROMO_DEBOUNCE_MS = 450;

export function isAuthFailure(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 401 || e.status === 403);
}

export function usePromoPreview(
  api: Pick<CheckoutApi, "reservePromo" | "previewPromo" | "releasePromo">,
  code: string,
  subtotal: number,
  /** Строки корзины `id*qty,…` (`promoItems`): код из кейса пропускает товары с низкой маржой. */
  items: string,
) {
  const trimmed = code.trim();
  const [debounced, setDebounced] = useState(trimmed);
  const lastReserved = useRef<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(trimmed), PROMO_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [trimmed]);

  // Замена кода не должна оставлять предыдущий удержанным.
  useEffect(() => {
    const previous = lastReserved.current;
    if (previous && previous !== debounced) {
      api.releasePromo(previous).catch(() => {});
    }
    lastReserved.current = debounced || null;
  }, [api, debounced]);

  const query = useQuery({
    queryKey: checkoutKeys.promo(debounced, subtotal, items),
    enabled: debounced.length > 0 && subtotal > 0,
    // Удержание продлевается каждой проверкой: устаревший кэш тихо дал бы ему истечь.
    staleTime: QUERY_PRESETS.list.staleTime,
    queryFn: async () => {
      try {
        return await api.reservePromo(debounced, subtotal, items);
      } catch (e) {
        if (isAuthFailure(e)) return api.previewPromo(debounced, subtotal, items);
        throw e;
      }
    },
  });

  return {
    data: query.data ?? null,
    // Пока идёт дебаунс, старый ответ нельзя выдавать за новый.
    loading: trimmed.length > 0 && (trimmed !== debounced || query.isFetching),
    discount: query.data?.valid ? query.data.discountMinor : 0,
  };
}
