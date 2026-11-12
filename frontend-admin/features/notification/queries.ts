"use client";

import { useApiMutation } from "@shop/ui/mutation";
import { toast } from "@shop/ui/toast";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError } from "@shop/core/errors";
import { useConfirm } from "@shop/ui/confirm";
import { QUERY_PRESETS } from "@shop/core/query";
import { broadcastApi, pushApi } from "./api";
import { notificationKeys } from "./keys";
import type { BroadcastStartBody, BroadcastTestBody, ShopLang } from "./model/types";

/** Опрос статуса идущей рассылки — раз в секунду, истории — раз в 3 с (быстрее пресета live). */
const STATUS_POLL_MS = 1000;
const HISTORY_POLL_MS = 3000;

export function useBroadcastAudiences(lang: ShopLang | "") {
  return useQuery({
    queryKey: notificationKeys.audiences(lang),
    queryFn: () => broadcastApi.audiences(lang),
    placeholderData: keepPreviousData,
  });
}

export function useBroadcastStatus() {
  return useQuery({
    queryKey: notificationKeys.status(),
    queryFn: broadcastApi.status,
    refetchInterval: (q) => (q.state.data?.running ? STATUS_POLL_MS : false),
    placeholderData: keepPreviousData,
  });
}

export function useBroadcastHistory(running: boolean) {
  return useQuery({
    queryKey: notificationKeys.history(),
    queryFn: () => broadcastApi.history(20),
    refetchInterval: running ? HISTORY_POLL_MS : false,
  });
}

/** Последний тик прогресса завершённой рассылки обновляет и строку истории. */
export function useRefreshHistoryWhenDone(status: { running: boolean } | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (status && !status.running) void qc.invalidateQueries({ queryKey: notificationKeys.history() });
  }, [status, qc]);
}

/** «Разослать»: тост об успехе и обновление статуса/истории; формой управляет вызывающий (`onSuccess`). */
export function useStartBroadcast(onStarted: () => void) {
  return useApiMutation({
    mutationFn: (body: BroadcastStartBody) => broadcastApi.start(body),
    invalidate: [notificationKeys.status(), notificationKeys.history()],
    success: "Рассылка запущена",
    errorFallback: "Не удалось запустить",
    onSuccess: onStarted,
  });
}

/** «Остановить»: подтверждение, затем стоп; статус и история обновляются, повторное нажатие безопасно. */
export function useStopBroadcast() {
  const confirm = useConfirm();
  const m = useApiMutation({
    mutationFn: () => broadcastApi.stop(),
    invalidate: [notificationKeys.status(), notificationKeys.history()],
    success: "Рассылка останавливается — уже отправленное останется",
    errorFallback: "Не удалось остановить",
  });
  async function requestStop() {
    if (m.isPending) return;
    const ok = await confirm({
      title: "Остановить рассылку?",
      message: "Уже отправленные сообщения останутся у получателей, неотправленные не уйдут. Продолжить рассылку потом нельзя — только начать заново.",
      confirmLabel: "Остановить",
      danger: true,
    });
    if (ok) m.mutate(undefined);
  }
  return { requestStop, stopping: m.isPending };
}

/** Тестовая отправка: ответ `ok:false` — тоже тост-ошибка с текстом сервера. */
export function useSendBroadcastTest() {
  return useApiMutation({
    mutationFn: (v: { body: BroadcastTestBody; toMe: boolean }) => broadcastApi.test(v.body),
    toastOnError: false,
    onSuccess: (r) => {
      (r.ok ? toast.success : toast.error)(r.detail);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Ошибка отправки"),
  });
}

/** Публичный конфиг push меняется редко — держим свежим вдвое дольше обычного списка. */
const PUSH_CONFIG_STALE_MS = QUERY_PRESETS.list.staleTime * 2;

/** Push на сервере: включён ли, ключ для подписки, сколько устройств у админа («Мой аккаунт» → «Это устройство»). */
export function usePushConfig() {
  return useQuery({ queryKey: notificationKeys.pushConfig(), queryFn: pushApi.config, staleTime: PUSH_CONFIG_STALE_MS });
}
