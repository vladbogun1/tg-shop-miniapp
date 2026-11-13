"use client";

/**
 * Коробки и упаковка: список «Коробок» (общий для онбординга, «Пакуй в» и настроек), правки коробок,
 * «Упаковано» и «Журнал упаковки». Фича-лист: списки заказов перечитывает вызывающий через `onDone`.
 */
import { QUERY_PRESETS } from "@shop/core/query";
import { useApiMutation } from "@shop/ui/mutation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { npBoxApi, packingApi } from "./api";
import { deliveryKeys } from "./keys";
import { confirmMessage } from "./model/packing";
import type { ConfirmBoxBody, ConfirmBoxResult, NpBoxEdit } from "./model/types";

export function useBoxesQuery(enabled = true) {
  return useQuery({
    queryKey: deliveryKeys.boxes(),
    queryFn: npBoxApi.list,
    enabled,
    staleTime: QUERY_PRESETS.static.staleTime,
    retry: false,
  });
}

/** Окно ТТН берёт коробки из предпросмотра (живой запрос) — перечитывать здесь только список. */
const BOX_KEYS = [deliveryKeys.boxes()];

/** «Есть / нет» и правка сторон. Тихо: тап по плитке не должен сыпать тостами. */
export function useUpdateBox() {
  return useApiMutation({
    mutationFn: ({ id, body }: { id: string; body: NpBoxEdit }) => npBoxApi.update(id, body),
    invalidate: BOX_KEYS,
    errorFallback: "Не удалось изменить коробку",
  });
}

export function useCreateBox(onDone?: () => void) {
  return useApiMutation({
    mutationFn: (body: NpBoxEdit) => npBoxApi.create(body),
    invalidate: BOX_KEYS,
    success: (b) => `Коробка «${b.name}» добавлена`,
    errorFallback: "Не удалось добавить коробку",
    onSuccess: () => onDone?.(),
  });
}

export function useDeleteBox() {
  return useApiMutation({
    mutationFn: (id: string) => npBoxApi.remove(id),
    invalidate: BOX_KEYS,
    success: "Коробка удалена",
    errorFallback: "Не удалось удалить коробку",
  });
}

/** «Готово»: список просмотрен — карточка онбординга сворачивается у всех. */
export function useBoxesReviewed(onDone?: () => void) {
  return useApiMutation({
    mutationFn: () => npBoxApi.reviewed(),
    invalidate: [deliveryKeys.boxes()],
    success: "Коробки сохранены",
    errorFallback: "Не удалось сохранить",
    onSuccess: () => onDone?.(),
  });
}

/** «Упаковано»: `before` — номер ТТН до подтверждения (тост «№… заменена на №…»). */
export function useConfirmBox(orderId: string, before: string | null | undefined, onDone: (r: ConfirmBoxResult) => void) {
  return useApiMutation({
    mutationFn: (body: ConfirmBoxBody) => packingApi.confirm(orderId, body),
    invalidate: [deliveryKeys.packingJournal(JOURNAL_DAYS)],
    success: (r) => confirmMessage(r, before),
    errorFallback: "Не удалось подтвердить коробку",
    onSuccess: onDone,
  });
}

/** Что помешает «Упаковано» с этой коробкой (те же проверки, что у ТТН, без запроса в НП). */
export function usePackCheck(orderId: string, bodyJson: string | null) {
  return useQuery({
    queryKey: deliveryKeys.packCheck(orderId, bodyJson ?? ""),
    queryFn: () => packingApi.check(orderId, JSON.parse(bodyJson ?? "{}") as ConfirmBoxBody),
    enabled: !!bodyJson,
    staleTime: QUERY_PRESETS.live.staleTime,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export const JOURNAL_DAYS = 30;

export function usePackingJournal(days = JOURNAL_DAYS, enabled = true) {
  return useQuery({ queryKey: deliveryKeys.packingJournal(days), queryFn: () => packingApi.journal(days), enabled, retry: false });
}
