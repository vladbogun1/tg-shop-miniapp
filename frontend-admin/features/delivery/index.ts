/**
 * Публичный вход фичи «Новая Почта» (бэкенд-модуль delivery): ТТН заказа, этикетки, отправитель, размеры посылок,
 * вебхук статусов. Фича-лист: сама не импортирует order / dispatch / settings / catalog / product — они берут отсюда.
 */
export { ShipmentBlock, type ShipmentOrder } from "./ui/ShipmentBlock";
export { Chip, Notice, ShipmentStageBadge } from "./ui/parts";
export { LabelPrint } from "./ui/LabelPrint";
export { ShipmentDialog } from "./ui/ShipmentDialog";
export { NP_PANELS, NpSettingsPanels, type NpPanelId } from "./ui/settings/NpSettingsPanels";
export { ParcelSizeEditor } from "./ui/size/ParcelSizeEditor";
export { CategoryParcelSize } from "./ui/size/CategoryParcelSize";
export type { ShipmentMode } from "./model/shipment-form";

export { npDirectoryApi, type BranchKind } from "./api";
export { deliveryKeys } from "./keys";
export { useBatchShipments, useSenderQuery } from "./queries";

export { SERVICE_LABEL, serviceLabel, shipmentEditable, stageLabel, stageTone } from "./model/labels";
export type {
  BatchResult,
  LabelFormat,
  NpCardFields,
  NpStreet,
  OrderServiceType,
  SenderWarehouse,
  Shipment,
  ShipmentStage,
} from "./model/types";
