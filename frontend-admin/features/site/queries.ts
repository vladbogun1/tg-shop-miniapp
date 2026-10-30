"use client";

import { ApiError } from "@shop/core/errors";
import { QUERY_PRESETS } from "@shop/core/query";
import { useApiMutation } from "@shop/ui/mutation";
import { toast } from "@shop/ui/toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { siteApi } from "./api";
import { siteKeys } from "./keys";

const INBOX_KEY = ["admin", "inbox"] as const;

/** Эндпоинты могли быть ещё не подключены на сервере. */
export function isMissing(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 404 || e.status === 405);
}

/** Статус последнего обновления; опрос раз в 30 с, при ошибке опрос прекращается. */
export function useSiteStatus() {
  return useQuery({
    queryKey: siteKeys.status(),
    queryFn: siteApi.status,
    retry: false,
    refetchInterval: (q) => (q.state.error ? false : QUERY_PRESETS.live.refetchInterval),
  });
}

/** «Обновить сайт»: пересобрать страницы сейчас. Ответ 200 с ok:false — не успех. */
export function useRevalidateSite() {
  const qc = useQueryClient();
  const refreshStatus = () => void qc.invalidateQueries({ queryKey: siteKeys.status() });
  return useApiMutation({
    mutationFn: () => siteApi.revalidate(),
    toastOnError: false,
    onSuccess: (res) => {
      if (res.ok === false) {
        toast.error(`Сайт не обновился: ${res.error ?? "неизвестная ошибка"}`);
        refreshStatus();
        return;
      }
      toast.success("Сайт обновляется — страницы пересоберутся в течение минуты");
      setTimeout(() => {
        refreshStatus();
        void qc.invalidateQueries({ queryKey: INBOX_KEY });
      }, 3_000);
    },
    onError: (e) =>
      toast.error(isMissing(e) ? "Обновление сайта ещё не подключено на сервере" : e instanceof ApiError ? e.message : "Не удалось обновить сайт"),
  });
}
