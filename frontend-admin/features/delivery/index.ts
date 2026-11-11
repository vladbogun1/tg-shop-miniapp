/**
 * Публичный вход фичи «Новая Почта» (бэкенд-модуль delivery): ТТН заказа, этикетки, отправитель, размеры посылок,
 * вебхук статусов. Фича-лист: сама не импортирует order / dispatch / settings / catalog / product — они берут отсюда.
 */
export { ShipmentBlock, type ShipmentOrder } from "./ui/ShipmentBlock";
export { ShipmentStageBadge } from "./ui/parts";
export { LabelPrint } from "./ui/LabelPrint";

export { npDirectoryApi, type BranchKind } from "./api";
export { deliveryKeys } from "./keys";
export { useBatchShipments, useSenderQuery } from "./queries";

export { SERVICE_LABEL, serviceLabel, shipmentEditable, stageLabel, stageTone } from "./model/labels";
export type {
  BatchResult,
  NpCardFields,
  NpDispatchFields,
  NpOrderFields,
  NpStreet,
  OrderServiceType,
  SenderWarehouse,
  Shipment,
  ShipmentStage,
} from "./model/types";
