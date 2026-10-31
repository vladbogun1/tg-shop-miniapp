"use client";

/** Чат заказа: страница сообщений, отправка, картинка, «прочитано», сокет. */
import { nowMs } from "@shop/core/time";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { closeChatNotifications } from "@/features/notification";
import { subscribeOrderChat } from "@/shell/realtime";
import { orderApi, type OrderMessage } from "../api";
import { orderKeys } from "../keys";
import { appendMessage, markCustomerRead } from "../model/chat";

/** Последняя страница чата; та же запись кэша, что у бейджа непрочитанных на вкладке «Чат». */
export function useOrderMessagesQuery(orderId: string | null) {
  return useQuery({
    queryKey: orderKeys.messages(orderId),
    queryFn: () => orderApi.messages(orderId as string),
    enabled: !!orderId,
  });
}

/**
 * Сбой «прочитано» молча игнорируем. Что при этом происходит: на сервере отметки нет, кэш сообщений и
 * доска/«Внимание» не обновляются (бейдж остаётся), закрывать уведомления не нужно; повторится при
 * следующем открытии чата или новом сообщении покупателя. Риск: бейдж «непрочитано» может задержаться;
 * тем же catch глотается и ошибка самого обновления кэша ниже. Поведение намеренно прежнее.
 */
function ignoreMarkReadFailure(): void {
  // намеренно пусто — см. комментарий выше
}

/**
 * Пометить чат прочитанным: покупатель видит ✓✓, с доски и из «Внимание» уходит бейдж.
 * Не `useApiMutation`: вызовы идут и при открытии, и на каждое новое сообщение покупателя — защита от
 * двойного нажатия молча отбросила бы второй, а кэш уже считал бы сообщение прочитанным. Ошибка тихая.
 */
export function markOrderRead(qc: QueryClient, orderId: string): void {
  orderApi
    .markRead(orderId)
    .then(() => {
      qc.setQueryData<OrderMessage[]>(orderKeys.messages(orderId), (prev) => markCustomerRead(prev, new Date(nowMs()).toISOString()));
      void qc.invalidateQueries({ queryKey: orderKeys.board() });
      // «Внимание» (and its badge on the menu / bell) lists unread chats.
      void qc.invalidateQueries({ queryKey: orderKeys.inbox() });
      closeChatNotifications(orderId);
    })
    .catch(ignoreMarkReadFailure);
}

/**
 * Прочитать при открытии и подписаться на сокет. Сообщение покупателя, пришедшее при открытом чате,
 * читается сразу — раньше оно оставалось «непрочитанным» на доске и в колокольчике.
 */
export function useOrderChatRealtime(orderId: string): void {
  const qc = useQueryClient();
  useEffect(() => {
    markOrderRead(qc, orderId);
    return subscribeOrderChat(orderId, (msg) => {
      qc.setQueryData<OrderMessage[]>(orderKeys.messages(orderId), (prev) => appendMessage(prev, msg));
      if (msg.senderType === "CUSTOMER" && document.visibilityState === "visible") markOrderRead(qc, orderId);
    });
  }, [orderId, qc]);
}

function useAppendToChat(orderId: string) {
  const qc = useQueryClient();
  return (msg: OrderMessage): void => {
    qc.setQueryData<OrderMessage[]>(orderKeys.messages(orderId), (prev) => appendMessage(prev, msg));
  };
}

export function useSendMessageMutation(orderId: string) {
  const append = useAppendToChat(orderId);
  return useApiMutation<OrderMessage, string>({
    mutationFn: (text) => orderApi.sendMessage(orderId, { type: "TEXT", text }),
    errorFallback: "Не удалось отправить",
    onSuccess: append,
  });
}

/** Картинка: загрузка и отправка одним действием. */
export function useSendPhotoMutation(orderId: string) {
  const append = useAppendToChat(orderId);
  return useApiMutation<OrderMessage, File>({
    mutationFn: async (file) => {
      const { key } = await orderApi.uploadChatAttachment(orderId, file);
      return orderApi.sendMessage(orderId, {
        type: "PHOTO",
        attachmentUrl: key,
        fileName: file.name,
        mimeType: file.type,
      });
    },
    errorFallback: "Не удалось загрузить",
    onSuccess: append,
  });
}

/** «Загрузить ранее»: страница перед сообщением `beforeId`. */
export function useOlderMessagesMutation(orderId: string) {
  return useApiMutation<OrderMessage[], number>({
    mutationFn: (beforeId) => orderApi.messages(orderId, beforeId),
    errorFallback: "Не удалось загрузить",
  });
}
