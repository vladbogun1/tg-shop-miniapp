"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@shop/ui/mutation";
import { isAuthenticated } from "@/lib/session";
import { INBOX_QUERY_KEY } from "@/lib/inbox";
import { reviewsApi } from "./api";
import { reviewKeys } from "./keys";
import { publishedToast, REVIEWS_PAGE_SIZE } from "./model/filters";
import type { AdminReview, ReviewAction, ReviewFilter } from "./model/types";

/** Бейдж меню опрашивает раз в минуту (не пресет live: счётчик, а не очередь). */
const PENDING_POLL_MS = 60_000;

export function useReviewsList(status: ReviewFilter, productId: string | null, page: number, enabled: boolean) {
  return useQuery({
    queryKey: reviewKeys.list(status, productId, page),
    queryFn: () => reviewsApi.list({ status, productId, page, size: REVIEWS_PAGE_SIZE }),
    enabled,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  });
}

/**
 * Бейдж меню «Отзывы»: все отзывы на модерации — то же число, что на вкладке «На модерации».
 * (Группа «Внимание», которой пользовались раньше, не считает отложенные и обрывается на 100.)
 * Лежит под тем же корнем ключа, что и список: обновление после «Опубликовать»/«Скрыть» трогает и его.
 */
export function useReviewsPending() {
  return useQuery({
    queryKey: reviewKeys.pendingCount(),
    queryFn: async () => (await reviewsApi.list({ status: "PENDING", page: 0, size: 1 })).pendingCount,
    refetchInterval: PENDING_POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: isAuthenticated(),
  });
}

interface ReviewActionVars {
  review: AdminReview;
  action: ReviewAction;
  text?: string;
}

function call({ review, action, text }: ReviewActionVars): Promise<unknown> {
  switch (action) {
    case "publish":
      return reviewsApi.publish(review.id);
    case "hide":
      return reviewsApi.hide(review.id);
    case "reply":
      return reviewsApi.reply(review.id, text ?? "");
    case "delete":
      return reviewsApi.remove(review.id);
  }
}

function successText({ review, action, text }: ReviewActionVars): string {
  switch (action) {
    case "publish":
      return publishedToast(!!review.orderId);
    case "hide":
      return "Отзыв скрыт с витрины";
    case "reply":
      return text ? "Ответ сохранён" : "Ответ убран";
    case "delete":
      return "Отзыв удалён";
  }
}

/** Действия модерации. После каждого обновляются список, бейдж меню и «Внимание». */
export function useReviewActions() {
  const m = useApiMutation({
    mutationFn: (v: ReviewActionVars) => call(v),
    invalidate: [reviewKeys.all(), INBOX_QUERY_KEY],
    success: (_d, v) => successText(v),
    errorFallback: "Ошибка",
  });
  const busy = m.isPending && m.variables ? { id: m.variables.review.id, action: m.variables.action } : null;
  /** true — действие прошло (редактор ответа тогда закрывается). */
  const run = (v: ReviewActionVars): Promise<boolean> => m.mutateAsync(v).then(() => true, () => false);
  return { busy, run };
}
