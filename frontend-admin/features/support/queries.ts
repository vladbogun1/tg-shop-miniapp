"use client";

import { QUERY_PRESETS } from "@shop/core/query";
import { nowMs } from "@shop/core/time";
import { useApiMutation } from "@shop/ui/mutation";
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { isAuthenticated } from "@/lib/session";
import type { SendMessageRequest } from "@shop/core/types";
import { INBOX_QUERY_KEY } from "@/lib/inbox";
import { supportApi } from "./api";
import { MESSAGES_SEGMENT, supportKeys } from "./keys";
import { appendUnique, markCustomerRead } from "./model/chat";
import type { SupportFilter, SupportMessage, SupportThread } from "./model/types";

/** Список вопросов опрашивается чаще бейджа (15 с против 30 с пресета live). */
const THREADS_POLL_MS = 15_000;

/** Nav badge: open threads waiting for an answer. Polled like «Внимание» (preset live). */
export function useSupportUnread() {
  return useQuery({
    queryKey: supportKeys.unread(),
    queryFn: supportApi.unreadCount,
    refetchInterval: QUERY_PRESETS.live.refetchInterval,
    refetchOnWindowFocus: true,
    enabled: isAuthenticated(),
  });
}

export function useSupportThreads(filter: SupportFilter, q: string) {
  return useQuery({
    queryKey: supportKeys.threads(filter, q),
    queryFn: () => supportApi.threads({ filter, q: q || undefined, limit: 200 }),
    refetchInterval: THREADS_POLL_MS,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
}

export function useSupportThread(threadId: string | null, initial: SupportThread | undefined) {
  return useQuery({
    queryKey: supportKeys.thread(threadId),
    queryFn: () => supportApi.thread(threadId!),
    enabled: !!threadId,
    placeholderData: initial && initial.id === threadId ? initial : undefined,
  });
}

export function useSupportMessages(threadId: string) {
  return useQuery({
    queryKey: supportKeys.messages(threadId),
    queryFn: () => supportApi.messages(threadId),
  });
}

/** Страница старее `beforeId` (для «Загрузить ранее»); состояние страниц держит экран чата. */
export const fetchOlderMessages = (threadId: string, beforeId: number) => supportApi.messages(threadId, beforeId);

/** After reading / answering / closing: the list, the badge and «Внимание» change. */
export function refreshSupport(qc: QueryClient): void {
  // Not the open chat itself — it is kept up to date in place.
  void qc.invalidateQueries({
    queryKey: supportKeys.all(),
    predicate: (q) => q.queryKey[MESSAGES_SEGMENT] !== "messages",
  });
  void qc.invalidateQueries({ queryKey: INBOX_QUERY_KEY });
}

/** Правки кэша открытого чата: добавить сообщение, пометить сообщения клиента прочитанными. */
export function useSupportChatCache(threadId: string) {
  const qc = useQueryClient();
  return useMemo(() => {
    const key = supportKeys.messages(threadId);
    return {
      append: (msg: SupportMessage) => qc.setQueryData<SupportMessage[]>(key, (prev) => appendUnique(prev, msg)),
      markRead: () =>
        qc.setQueryData<SupportMessage[]>(key, (prev) => markCustomerRead(prev, new Date(nowMs()).toISOString())),
    };
  }, [qc, threadId]);
}


/** «Закрыть» / «Открыть снова» — по текущему статусу. */
export function useToggleThreadStatus() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (thread: SupportThread) =>
      thread.status === "OPEN" ? supportApi.close(thread.id) : supportApi.reopen(thread.id),
    success: (next) => (next.status === "CLOSED" ? "Вопрос закрыт" : "Вопрос открыт снова"),
    errorFallback: "Не удалось изменить статус",
    onSuccess: (next) => {
      qc.setQueryData(supportKeys.thread(next.id), next);
      refreshSupport(qc);
    },
  });
}

/** Ответ клиенту: сообщение сразу в чат; ответ снимает «ждёт ответа» и открывает закрытый вопрос. */
export function useSendSupportMessage(threadId: string, onSent: () => void) {
  const qc = useQueryClient();
  const cache = useSupportChatCache(threadId);
  return useApiMutation({
    mutationFn: (text: string) => supportApi.send(threadId, { type: "TEXT", text }),
    errorFallback: "Не удалось отправить",
    onSuccess: (msg) => {
      cache.append(msg);
      refreshSupport(qc);
      onSent();
    },
  });
}

/** Картинка или PDF: загрузка, затем сообщение с вложением. */
export function useSendSupportFile(threadId: string) {
  const qc = useQueryClient();
  const cache = useSupportChatCache(threadId);
  return useApiMutation({
    mutationFn: async (file: File) => {
      const isImage = file.type.startsWith("image/");
      const { key } = await supportApi.uploadAttachment(threadId, file);
      const body: SendMessageRequest = {
        type: isImage ? "PHOTO" : "FILE",
        attachmentUrl: key,
        fileName: file.name,
        mimeType: file.type,
      };
      return supportApi.send(threadId, body);
    },
    errorFallback: "Не удалось загрузить",
    onSuccess: (msg) => {
      cache.append(msg);
      refreshSupport(qc);
    },
  });
}

/**
 * Пометка «прочитано». Не useApiMutation: это фоновое подтверждение, которое вызывается на каждое
 * новое сообщение клиента, а защита от двойного нажатия молча отбросила бы вызов во время
 * предыдущего (сообщение осталось бы непрочитанным). Ошибка тоже тихая.
 */
export function useMarkSupportRead(threadId: string) {
  const qc = useQueryClient();
  const cache = useSupportChatCache(threadId);
  return useCallback(() => {
    supportApi
      .markRead(threadId)
      .then(() => {
        cache.markRead();
        // List row, nav badge and «Внимание» drop the unread count.
        refreshSupport(qc);
      })
      .catch(() => {});
  }, [threadId, qc, cache]);
}
