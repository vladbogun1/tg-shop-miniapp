"use client";

import { QUERY_PRESETS } from "@shop/core/query";
import type { CardStatus } from "@shop/core/catalog";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { invalidateCards } from "@/features/cards";
import { translationApi } from "@/features/translation";
import { productApi } from "./api";
import { productKeys } from "./keys";
import type { ProductWriteRequest } from "./model/types";

interface ProductsQueryOpts {
  /** true — архив, false — активные, не задан — активные под общим корнем ключа (для выбора товара, заказов, предзаказов). */
  archived?: boolean;
  /** Не задан — по умолчанию приложения. */
  staleTime?: number;
}

export function useProductsQuery({ archived, staleTime }: ProductsQueryOpts = {}) {
  return useQuery({
    queryKey: productKeys.list(archived),
    queryFn: archived ? productApi.listArchived : productApi.list,
    ...(staleTime !== undefined ? { staleTime } : {}),
  });
}

/**
 * После показа/скрытия/архивации/правки товара: он переезжает между вкладками «Карточек» (бейдж меню считает только
 * работу над витриной), в «Переводах» появляются или устаревают тексты, а предупреждение «переводы сбросятся» в
 * окне товара читает свою выгрузку переведённых текстов.
 */
export function invalidateProductDerived(qc: QueryClient): void {
  invalidateCards(qc);
  qc.invalidateQueries({ queryKey: productKeys.translatedRoot() });
}

/** Второе нажатие в полёте `useApiMutation` тихо отбрасывает; ловящий код не должен показывать это как ошибку. */
export function isDoubleSubmit(e: unknown): boolean {
  return e instanceof Error && e.name === "DoubleSubmitError";
}

/** Переведённые тексты меняются редко: 1 минута (два окна свежести списка). */
const TRANSLATED_STALE_MS = QUERY_PRESETS.list.staleTime * 2;

/** Тексты uk/en, переведённые у товаров: окно товара считает, сколько из них сбросит правка русского. */
export function useTranslatedTexts(enabled: boolean) {
  return useQuery({
    queryKey: productKeys.translatedUkEn(),
    queryFn: async () => {
      const [uk, en] = await Promise.all([translationApi.export("uk", "translated"), translationApi.export("en", "translated")]);
      return [...uk, ...en];
    },
    enabled,
    staleTime: TRANSLATED_STALE_MS,
  });
}

// ---- запись ----------------------------------------------------------------------------
// Ошибку каждой записи показывает вызывающий (409 CARD_NOT_READY / STOCK_CONFLICT разбирает окно, а не тост).

export function useSetProductActive() {
  return useApiMutation({
    mutationFn: (v: { id: string; active: boolean; force?: boolean }) => productApi.setActive(v.id, v.active, v.force ?? false),
    toastOnError: false,
  });
}

export function useSetProductArchived() {
  return useApiMutation({
    mutationFn: (v: { id: string; archived: boolean }) => productApi.setArchived(v.id, v.archived),
    toastOnError: false,
  });
}

/** «Отметить проверенной» / «Вернуть в черновик»: после успеха — счётчики и списки «Карточек». */
export function useSetCardStatus() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (v: { id: string; status: CardStatus }) => productApi.setCardStatus(v.id, v.status),
    success: (_d, v) => (v.status === "READY" ? "Карточка отмечена проверенной" : "Карточка возвращена в черновик"),
    errorFallback: "Не удалось изменить статус",
    onSuccess: () => invalidateCards(qc),
  });
}

export function useCreateProduct() {
  return useApiMutation({
    mutationFn: (body: ProductWriteRequest) => productApi.create(body),
    success: "Товар создан — скрыт до оформления",
    errorFallback: "Не удалось создать",
  });
}

export function useUpdateProduct() {
  return useApiMutation({
    mutationFn: (v: { id: string; body: ProductWriteRequest; force?: boolean }) => productApi.update(v.id, v.body, v.force ?? false),
    toastOnError: false,
  });
}

/** Свежий товар из списка (без кэша): после 409 STOCK_CONFLICT форма берёт из него актуальные остатки. */
export async function fetchFreshProduct(id: string) {
  return (await productApi.list()).find((x) => x.id === id);
}

/** Фото товара → ключ для `imageKeys`. */
export const uploadProductPhoto = productApi.uploadPhoto;
