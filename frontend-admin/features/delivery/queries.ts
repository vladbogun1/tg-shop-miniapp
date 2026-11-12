"use client";

import { QUERY_PRESETS } from "@shop/core/query";
import { useApiMutation } from "@shop/ui/mutation";
import { toast } from "@shop/ui/toast";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchLabels, npAdminApi, npWebhookApi, shipmentApi } from "./api";
import { deliveryKeys } from "./keys";
import { successMessage, type ShipmentMode } from "./model/shipment-form";
import type { BatchResult, LabelFormat, ParcelSize, ProductSize, SenderConfig, Shipment, ShipmentOptions } from "./model/types";

// ---- ТТН заказа -----------------------------------------------------------------------------------

/** Предпросмотр ТТН по JSON формы; при пересчёте показывается прежний ответ. Свежий при каждом открытии. */
export function useShipmentPreviewQuery(orderId: string, optionsJson: string, enabled: boolean) {
  return useQuery({
    queryKey: deliveryKeys.preview(orderId, optionsJson),
    queryFn: () => shipmentApi.preview(orderId, JSON.parse(optionsJson) as ShipmentOptions),
    enabled,
    staleTime: QUERY_PRESETS.live.staleTime,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** Создать (POST) или изменить / пересоздать (PUT); тост различает новый номер и тот же. */
export function useSaveShipment(orderId: string, mode: ShipmentMode, before: string | null | undefined, onDone: (s: Shipment) => void) {
  return useApiMutation<Shipment, ShipmentOptions>({
    mutationFn: (options) => (mode === "create" ? shipmentApi.create(orderId, options) : shipmentApi.update(orderId, options)),
    success: (s) => successMessage(mode, before, s),
    errorFallback: "Не удалось сохранить ТТН",
    onSuccess: (s) => onDone(s),
  });
}

export function useCancelShipment(orderId: string, onDone: () => void) {
  return useApiMutation<void, string>({
    mutationFn: () => shipmentApi.cancel(orderId),
    success: (_r, ttn) => `ТТН ${ttn} отменена`,
    errorFallback: "Не удалось отменить ТТН",
    onSuccess: onDone,
  });
}

export function useRefreshShipment(orderId: string, onDone: () => void) {
  return useApiMutation({
    mutationFn: () => shipmentApi.refresh(orderId),
    success: "Статус обновлён",
    errorFallback: "Не удалось обновить статус",
    onSuccess: onDone,
  });
}

export interface PrintVars {
  /** Вкладка, открытая синхронно в обработчике нажатия (`openLabelsTab`). */
  tab: Window | null;
  orderIds: string[];
  format: LabelFormat;
}

/** Печать этикеток одним PDF; тестовый режим и пропущенные заказы — отдельным тостом. */
export function usePrintLabels() {
  return useApiMutation({
    mutationFn: ({ tab, orderIds, format }: PrintVars) => fetchLabels(tab, orderIds, format),
    errorFallback: "Не удалось получить этикетки",
    onSuccess: (r) => {
      if (r.skipped.length > 0) toast.info(`Без этикетки: ${r.skipped.length} — у них нет действующей ТТН`);
      if (r.dryRun) toast.info("Тестовые этикетки: Новая Почта в тестовом режиме");
    },
  });
}

/** «Створити ТТН для всіх»: по заказу на строку результата. */
export function useBatchShipments(onDone: (rows: BatchResult[]) => void) {
  return useApiMutation({
    mutationFn: ({ orderIds, senderRef }: { orderIds: string[]; senderRef: string | null }) => shipmentApi.batch(orderIds, senderRef),
    errorFallback: "Не удалось создать ТТН",
    success: (rows) => {
      const ok = rows.filter((r) => r.ok).length;
      return ok === rows.length ? `ТТН созданы: ${ok}` : `Создано ${ok} из ${rows.length} — причины в списке`;
    },
    onSuccess: onDone,
  });
}

// ---- отправитель, коробки, вебхук ----------------------------------------------------------------

export function useSenderQuery(enabled = true) {
  return useQuery({ queryKey: deliveryKeys.sender(), queryFn: npAdminApi.sender, enabled, retry: false });
}

export function useLoadSender() {
  return useApiMutation({
    mutationFn: () => npAdminApi.loadSender(),
    invalidate: [deliveryKeys.sender()],
    success: "Данные отправителя загружены из кабинета НП",
    errorFallback: "Не удалось загрузить отправителя",
  });
}

export function useSaveSender() {
  return useApiMutation({
    mutationFn: (cfg: SenderConfig) => npAdminApi.saveSender(cfg),
    invalidate: [deliveryKeys.sender()],
    success: "Отправитель сохранён",
    errorFallback: "Не удалось сохранить отправителя",
  });
}

export function useCheckKey() {
  return useApiMutation({
    mutationFn: () => npAdminApi.checkKey(),
    errorFallback: "Не удалось проверить ключ",
    toastOnError: true,
  });
}

export function useWebhookQuery() {
  return useQuery({ queryKey: deliveryKeys.webhook(), queryFn: npWebhookApi.status, retry: false });
}

export function useSubscribeWebhook(onDone: () => void) {
  return useApiMutation({
    mutationFn: (tin: string) => npWebhookApi.subscribe(tin.trim() || undefined),
    invalidate: [deliveryKeys.webhook()],
    success: "Подписка оформлена — статусы будут приходить сразу",
    errorFallback: "Не удалось подписаться",
    onSuccess: onDone,
  });
}

export function useUnsubscribeWebhook() {
  return useApiMutation({
    mutationFn: (id: string) => npWebhookApi.unsubscribe(id),
    invalidate: [deliveryKeys.webhook()],
    success: "Подписка удалена",
    errorFallback: "Не удалось удалить подписку",
  });
}

// ---- размеры посылок ---------------------------------------------------------------------------

export function useProductSizeQuery(id: string) {
  return useQuery({ queryKey: deliveryKeys.productSize(id), queryFn: () => npAdminApi.productSize(id), retry: false });
}

export function useSaveProductSize(id: string) {
  return useApiMutation({
    mutationFn: (body: ProductSize) => npAdminApi.saveProductSize(id, body),
    invalidate: [deliveryKeys.productSize(id)],
    success: "Размеры сохранены",
    errorFallback: "Не удалось сохранить размеры",
  });
}

export function useCategorySizesQuery() {
  return useQuery({ queryKey: deliveryKeys.categorySizes(), queryFn: npAdminApi.categorySizes, retry: false });
}

export function useSaveCategorySize() {
  return useApiMutation({
    mutationFn: ({ id, size }: { id: string; size: ParcelSize }) => npAdminApi.saveCategorySize(id, size),
    invalidate: [deliveryKeys.categorySizes()],
    success: "Размер категории сохранён",
    errorFallback: "Не удалось сохранить размер",
  });
}
