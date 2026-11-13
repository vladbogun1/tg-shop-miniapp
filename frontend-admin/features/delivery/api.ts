/**
 * Новая Почта в админке: ТТН заказа, пакетное создание и печать этикеток, отправитель, размеры посылок,
 * вебхук статусов; публичные справочники (отделения по типу, улицы).
 * URL и JSON — как в ветке np-integration (контракт бэкенда delivery). Ключ НП в браузер не попадает:
 * PDF этикеток отдаёт наш сервер по токену админа.
 */
import { ApiError } from "@shop/core/errors";
import type { NpCity, NpWarehouse } from "@shop/core/types";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/http";
import { apiOrigin } from "@/lib/origin";
import { getAccessToken } from "@/lib/session";
import type {
  BatchResult,
  CategorySize,
  ConfirmBoxBody,
  ConfirmBoxResult,
  KeyCheck,
  LabelFormat,
  LabelsResult,
  NpBox,
  NpBoxEdit,
  NpBoxList,
  NpBranch,
  NpStreet,
  PackCheck,
  PackingJournal,
  ParcelSize,
  ProductSize,
  SenderConfig,
  SenderResponse,
  Shipment,
  ShipmentOptions,
  ShipmentPreview,
  WebhookStatus,
  WebhookSubscription,
} from "./model/types";

const q = encodeURIComponent;

export const shipmentApi = {
  preview: (orderId: string, options: ShipmentOptions) =>
    apiPost<ShipmentPreview>(`/api/admin/orders/${orderId}/shipment/preview`, options),
  create: (orderId: string, options: ShipmentOptions) => apiPost<Shipment>(`/api/admin/orders/${orderId}/shipment`, options),
  /** Сервер сам решает: напечатанную ТТН удаляет и создаёт новую, ненапечатанную — правит. */
  update: (orderId: string, options: ShipmentOptions) => apiPut<Shipment>(`/api/admin/orders/${orderId}/shipment`, options),
  cancel: (orderId: string) => apiDelete<void>(`/api/admin/orders/${orderId}/shipment`),
  refresh: (orderId: string) => apiPost<Shipment>(`/api/admin/orders/${orderId}/shipment/refresh`, {}),
  batch: (orderIds: string[], senderWarehouseRef?: string | null) =>
    apiPost<BatchResult[]>("/api/admin/shipments/batch", { orderIds, senderWarehouseRef: senderWarehouseRef || undefined }),
};

export const npAdminApi = {
  sender: () => apiGet<SenderResponse>("/api/admin/np/sender"),
  loadSender: () => apiPost<SenderResponse>("/api/admin/np/sender/load", {}),
  saveSender: (cfg: SenderConfig) => apiPut<SenderResponse>("/api/admin/np/sender", cfg),
  checkKey: () => apiPost<KeyCheck>("/api/admin/np/check-key", {}),
  warehouses: (cityRef: string, query: string) => apiGet<NpBranch[]>(`/api/admin/np/warehouses?cityRef=${q(cityRef)}&q=${q(query)}`),
  productSize: (id: string) => apiGet<ProductSize>(`/api/admin/np/size/products/${id}`),
  saveProductSize: (id: string, body: ProductSize) => apiPut<ProductSize>(`/api/admin/np/size/products/${id}`, body),
  categorySizes: () => apiGet<CategorySize[]>("/api/admin/np/size/categories"),
  saveCategorySize: (id: string, size: ParcelSize) => apiPut<CategorySize>(`/api/admin/np/size/categories/${id}`, size),
};

export const npWebhookApi = {
  status: () => apiGet<WebhookStatus>("/api/admin/np/webhook"),
  /** Пустой `companyTin` — ЄДРПОУ/ІПН отправителя из кабинета (подставит бэкенд). */
  subscribe: (companyTin?: string) =>
    apiPost<WebhookSubscription>("/api/admin/np/webhook/subscribe", companyTin ? { companyTin } : {}),
  unsubscribe: (id: string) => apiDelete<void>(`/api/admin/np/webhook/subscriptions/${q(id)}`),
};

/** «Коробки»: каталог НП и свои; у каталожной DELETE сервер не даёт — только «нет в наличии». */
export const npBoxApi = {
  list: () => apiGet<NpBoxList>("/api/admin/np/boxes"),
  create: (body: NpBoxEdit) => apiPost<NpBox>("/api/admin/np/boxes", body),
  update: (id: string, body: NpBoxEdit) => apiPut<NpBox>(`/api/admin/np/boxes/${q(id)}`, body),
  remove: (id: string) => apiDelete<void>(`/api/admin/np/boxes/${q(id)}`),
  reviewed: () => apiPost<NpBoxList>("/api/admin/np/boxes/reviewed", {}),
};

/** Упаковка: «Упаковано» (коробка посылки) и «Журнал упаковки». */
export const packingApi = {
  confirm: (orderId: string, body: ConfirmBoxBody) => apiPost<ConfirmBoxResult>(`/api/admin/np/shipments/${q(orderId)}/box`, body),
  check: (orderId: string, body: ConfirmBoxBody) => apiPost<PackCheck>(`/api/admin/np/shipments/${q(orderId)}/box/check`, body),
  journal: (days: number) => apiGet<PackingJournal>(`/api/admin/np/packing/journal?days=${days}`),
};

export type BranchKind = "warehouse" | "postomat";

/** Публичные справочники НП (те же, что у покупателя). */
export const npDirectoryApi = {
  cities: (query: string) => apiGet<NpCity[]>(`/api/np/cities?q=${q(query)}`),
  warehouses: (cityRef: string, query: string, kind?: BranchKind) =>
    apiGet<NpWarehouse[]>(`/api/np/warehouses?cityRef=${q(cityRef)}&q=${q(query)}${kind ? `&kind=${kind}` : ""}`),
  streets: (cityRef: string, query: string) => apiGet<NpStreet[]>(`/api/np/streets?cityRef=${q(cityRef)}&q=${q(query)}`),
};

// ---- PDF этикеток -------------------------------------------------------------------------------

/** Blob-ссылка открытого PDF живёт, пока открыта вкладка; освобождаем через минуту. */
const BLOB_TTL_MS = 60_000;

/**
 * Пустая вкладка под этикетки — открывать СИНХРОННО в обработчике нажатия: вкладку, открытую после
 * `await`, браузер блокирует. Потом её передают в `fetchLabels`.
 */
export function openLabelsTab(): Window | null {
  const tab = window.open("", "_blank");
  try {
    if (tab) {
      tab.document.title = "Этикетки Новой Почты";
      tab.document.body.style.cssText = "margin:0;background:#111;color:#bbb;font:14px sans-serif;padding:24px";
      tab.document.body.textContent = "Загружаем этикетки…";
    }
  } catch {
    // заглушка во вкладке необязательна
  }
  return tab;
}

async function labelsError(res: Response): Promise<ApiError> {
  let message = `Не удалось получить этикетки (${res.status})`;
  let code: string | undefined;
  try {
    const body = (await res.json()) as { message?: string; error?: string; code?: string };
    message = body.message || body.error || message;
    code = body.code;
  } catch {
    // не JSON
  }
  return new ApiError(message, res.status, code);
}

function showPdf(tab: Window | null, url: string, count: number) {
  if (tab && !tab.closed) {
    tab.location.href = url;
    return;
  }
  // Вкладку заблокировали — скачиваем.
  const a = document.createElement("a");
  a.href = url;
  a.download = `np-labels-${count}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * PDF этикеток выбранных заказов одним файлом. Прямой fetch (ESLint ALLOW_RAW): HttpClient разбирает только JSON,
 * а здесь нужен blob и заголовки X-Labels-Count / X-Dry-Run / X-Labels-Skipped.
 */
export async function fetchLabels(tab: Window | null, orderIds: string[], format: LabelFormat): Promise<LabelsResult> {
  try {
    const qs = new URLSearchParams({ orderIds: orderIds.join(","), format });
    const token = getAccessToken();
    const res = await fetch(`${apiOrigin}/api/admin/shipments/labels?${qs.toString()}`, {
      headers: { Accept: "application/pdf", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: "include",
    });
    if (!res.ok) throw await labelsError(res);
    const url = URL.createObjectURL(await res.blob());
    window.setTimeout(() => URL.revokeObjectURL(url), BLOB_TTL_MS);
    showPdf(tab, url, orderIds.length);
    return {
      count: Number(res.headers.get("X-Labels-Count")) || orderIds.length,
      dryRun: res.headers.get("X-Dry-Run") === "true",
      skipped: (res.headers.get("X-Labels-Skipped") ?? "").split(",").filter(Boolean),
    };
  } catch (e) {
    if (tab && !tab.closed) tab.close();
    throw e;
  }
}
