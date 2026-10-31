"use client";

/** Шаблоны ответов в чате (⚡): список для заказа, управление списком. */
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery } from "@tanstack/react-query";
import { orderApi, type ReplyTemplate, type ReplyTemplateWrite } from "../api";
import { orderKeys } from "../keys";

/** Шаблоны, заполненные под этот заказ на языке покупателя. */
export function useRenderedTemplatesQuery(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: orderKeys.replyTemplatesFor(orderId),
    queryFn: () => orderApi.renderedTemplates(orderId),
    enabled,
  });
}

export function useReplyTemplatesQuery(enabled: boolean) {
  return useQuery({
    queryKey: orderKeys.replyTemplates(),
    queryFn: orderApi.replyTemplates,
    enabled,
  });
}

/** `template` = null — новый шаблон. */
export function useSaveTemplateMutation(template: ReplyTemplate | null, onSaved: () => void) {
  return useApiMutation<ReplyTemplate, ReplyTemplateWrite>({
    mutationFn: (body) => (template ? orderApi.updateReplyTemplate(template.id, body) : orderApi.createReplyTemplate(body)),
    invalidate: [orderKeys.replyTemplates()],
    success: "Шаблон сохранён",
    errorFallback: "Не удалось сохранить",
    onSuccess: onSaved,
  });
}

export function useDeleteTemplateMutation() {
  return useApiMutation<void, ReplyTemplate>({
    mutationFn: (t) => orderApi.deleteReplyTemplate(t.id),
    invalidate: [orderKeys.replyTemplates()],
    success: "Шаблон удалён",
    errorFallback: "Не удалось удалить",
  });
}
