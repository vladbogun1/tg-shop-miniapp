/**
 * Формы ответов и тел запросов Новой Почты (бэкенд-модуль delivery) — из OpenAPI (контракты order и delivery).
 * Поверх сгенерированных типов только строки-перечисления для сравнения в UI и размеры с null
 * («не задано — наследуется»): у сгенерированных типов необязательные поля без `| null`.
 */
import type { Schemas } from "@shop/core/api/schemas";

export type ShipmentStage =
  | "CREATED"
  | "IN_TRANSIT"
  | "ARRIVED"
  | "RECEIVED"
  | "REFUSED"
  | "RETURNING"
  | "CANCELLED"
  | "NOT_FOUND";

/** Тип доставки в ТТН и в API НП. */
export type NpServiceType = "WarehouseWarehouse" | "WarehousePostomat" | "WarehouseDoors";

/** Тип доставки в заказе (enum бэкенда). */
export type OrderServiceType = "WAREHOUSE" | "POSTOMAT" | "DOORS";

export type ShipmentOrigin = "API" | "MANUAL";

// Контракт order (feat/np-v2-be-order): ShipmentBrief и поля НП в OrderDetailDto / DispatchOrderDto — из OpenAPI.
// Стадия, происхождение и тип доставки там строками; UI сравнивает их с ShipmentStage / ShipmentOrigin / OrderServiceType.

/** Активная посылка заказа. origin: API — создана нашим ключом (правится, удаляется, печатается); MANUAL — номер введён руками. */
export type Shipment = Schemas["ShipmentBrief"];

/** Что админ может поменять перед «Створити ТТН»; не задано — взять из заказа. */
/** null — «взять из заказа», как и отсутствующее поле (JSON тот же, что в ветке np-integration). */
export type ShipmentOptions = { [K in keyof Schemas["Options"]]?: Schemas["Options"][K] | null };
export type ShipmentPreview = Schemas["Preview"];
export type Parcel = Schemas["Parcel"];
/** Одно место ТТН; box — имя заготовки, пусто — товар в своей упаковке. */
export type ParcelSeat = Schemas["DeliveryParcelSeat"];
/** Заготовка коробки: вес пустой коробки tareG, цена коробки в отделении packMinor (копейки). */
export type BoxPreset = Schemas["BoxPreset"];
export type SenderWarehouse = Schemas["SenderWarehouse"];
export type BatchResult = Schemas["BatchResult"];
export type BatchRequest = Schemas["ShipmentBatchRequest"];

export type LabelFormat = "100x100" | "85x85" | "a4";

/** Ответ GET /api/admin/shipments/labels — PDF; эти числа приходят заголовками X-Labels-Count / X-Dry-Run / X-Labels-Skipped. */
export interface LabelsResult {
  count: number;
  dryRun: boolean;
  skipped: string[];
}

export type SenderContact = Schemas["Contact"];
export type SenderConfig = Schemas["SenderConfig"];
export type SenderResponse = Schemas["SenderResponse"];
export type KeyCheck = Schemas["KeyCheck"];
/** Отделение справочника (админский поиск отделений отправки). */
export type NpBranch = Schemas["NpWarehouseDto"];
/** Улица города НП (GET /api/np/streets) — `ref` уходит в заказ. */
export type NpStreet = Schemas["Street"];

/** Граммы / миллиметры; null — наследуется (вариант → товар → категория → настройки). */
export type ParcelSize = { [K in keyof Schemas["Size"]]: Schemas["Size"][K] | null };
export type VariantSize = Omit<Schemas["VariantSize"], "size"> & { size: ParcelSize };
export type ProductSize = Omit<Schemas["ProductSize"], "size" | "variants"> & { size: ParcelSize; variants: VariantSize[] };
export type CategorySize = Omit<Schemas["CategorySize"], "size"> & { size: ParcelSize };

export type WebhookSubscription = Schemas["DeliveryNpTrackingPushSubscription"];
/** configured — на сервере заданы адрес (https) и секрет вебхука; error — почему список не прочитан. */
export type WebhookStatus = Schemas["WebhookStatus"];
