/**
 * Формы ответов и тел запросов Новой Почты (бэкенд-модуль delivery).
 *
 * Контракт order уже в OpenAPI (см. ниже). np-contract: остальное (окно ТТН, отправитель, размеры, вебхук) повторяет DTO
 * ветки np-integration один в один, пока не придёт контракт delivery (feat/np-v2-be-delivery).
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

// np-contract: поля строки доски / таблицы. В контракте они есть только в OrderSummaryDto, а доска и таблица
// мастера читают OrderCardDto — пока бэкенд их туда не добавит, поля пустые и бейдж стадии не рисуется.
export interface NpCardFields {
  trackingNumber?: string | null;
  shipmentStage?: ShipmentStage | null;
  trackingUrl?: string | null;
}

/** Что админ может поменять перед «Створити ТТН»; не задано — взять из заказа. */
export interface ShipmentOptions {
  senderWarehouseRef?: string | null;
  weightG?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  declaredMinor?: number | null;
  collectCod?: boolean | null;
  description?: string | null;
  /** yyyy-mm-dd */
  date?: string | null;
  recipientLastName?: string | null;
  recipientFirstName?: string | null;
  recipientMiddleName?: string | null;
  allowUnpaid?: boolean;
  /** «Документи» вместо «Посилка» (одно место до 1 кг); null — как решит магазин. */
  documents?: boolean | null;
}

// np-contract
export interface BoxPreset {
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  /** Вес пустой коробки, г. */
  tareG?: number;
  /** Сколько отделение берёт за коробку, копейки. */
  packMinor?: number;
}

// np-contract: одно место ТТН.
export interface ParcelSeat {
  weightG: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  /** Имя заготовки; null — товар в своей упаковке. */
  box?: string | null;
}

// np-contract
export interface SenderWarehouse {
  ref: string;
  number: string;
  description: string;
  cityRef?: string | null;
  cityName?: string | null;
}

// np-contract
export interface Parcel {
  weightG: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  /** Откуда взяты числа (товары / категория / настройки). */
  source?: string | null;
  /** Все места; стороны выше — первого места, вес — общий. */
  seats?: ParcelSeat[];
  packMinor?: number;
  documents?: boolean;
}

// np-contract
export interface ShipmentPreview {
  orderId: string;
  shortId: string;
  orderStatus: string;
  serviceType: NpServiceType;
  recipientLastName?: string | null;
  recipientFirstName?: string | null;
  recipientMiddleName?: string | null;
  recipientPhone?: string | null;
  cityName?: string | null;
  destination?: string | null;
  senderWarehouseRef?: string | null;
  senderWarehouses: SenderWarehouse[];
  parcel: Parcel;
  presets: BoxPreset[];
  declaredMinor: number;
  codMinor: number;
  collectCod: boolean;
  description?: string | null;
  date?: string | null;
  estimateMinor?: number | null;
  codFeeMinor?: number | null;
  payer?: string | null;
  /** Блокирующие: ТТН не создать, пока их не исправят. */
  problems: string[];
  /** НП может отказать или взять больше. */
  warnings: string[];
  /** Онлайн-оплата не пришла — создание требует `allowUnpaid`. */
  unpaid: boolean;
  amountDueMinor: number;
  dryRun: boolean;
  existing?: Shipment | null;
}

// np-contract
export interface BatchResult {
  orderId: string;
  shortId: string;
  ok: boolean;
  ttn?: string | null;
  error?: string | null;
}

export type LabelFormat = "100x100" | "85x85" | "a4";

export interface LabelsResult {
  count: number;
  dryRun: boolean;
  skipped: string[];
}

// np-contract
export interface SenderContact {
  ref: string;
  name: string;
  phone?: string | null;
}

// np-contract
export interface SenderConfig {
  counterpartyRef: string;
  counterpartyName: string;
  /** PrivatePerson (ФОП) / Organization. */
  ownershipForm?: string | null;
  contactRef: string;
  contactName?: string | null;
  phone: string;
  contacts: SenderContact[];
  warehouses: SenderWarehouse[];
  defaultWarehouseRef?: string | null;
  loadedAt?: string | null;
}

// np-contract
export interface SenderResponse {
  sender: SenderConfig | null;
  keyConfigured: boolean;
  dryRun: boolean;
}

// np-contract
export interface KeyCheck {
  configured: boolean;
  ok: boolean;
  dryRun: boolean;
  counterpartyName?: string | null;
  message?: string | null;
}

// np-contract: NpWarehouseDto — отделение справочника (админский поиск).
export interface NpBranch {
  ref: string;
  number: string;
  description: string;
  type?: string | null;
  category?: string | null;
  cityRef: string;
  cityName: string;
  maxWeightKg?: number | null;
}

/** Улица города НП (GET /api/np/streets) — `ref` уходит в заказ. */
export interface NpStreet {
  ref: string;
  name: string;
  type?: string | null;
}

/** Граммы / миллиметры; null — наследуется (вариант → товар → категория → настройки). */
export interface ParcelSize {
  weightG: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
}

// np-contract
export interface VariantSize {
  id: string;
  name: string;
  size: ParcelSize;
}

// np-contract
export interface ProductSize {
  id: string;
  size: ParcelSize;
  variants: VariantSize[];
  categoryId?: string | null;
}

// np-contract
export interface CategorySize {
  id: string;
  parentId?: string | null;
  name: string;
  size: ParcelSize;
}

// np-contract
export interface WebhookSubscription {
  id: string;
  type?: string | null;
  url?: string | null;
  active: boolean;
  companyTins?: string[] | null;
}

// np-contract
export interface WebhookStatus {
  /** На сервере заданы NOVAPOSHTA_WEBHOOK_URL (https) и NOVAPOSHTA_WEBHOOK_SECRET. */
  configured: boolean;
  /** Куда НП будет слать (наш сервер). */
  url?: string | null;
  subscriptions: WebhookSubscription[];
  /** Почему список не прочитан (нет ключа, НП недоступна); null — прочитан. */
  error?: string | null;
}
