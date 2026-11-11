/** Подписи Новой Почты в админке (русские, по правилу админки) и правила «что можно с ТТН». */
import type { LabelFormat, Shipment, ShipmentStage } from "./types";

export const STAGE_LABEL: Record<ShipmentStage, string> = {
  CREATED: "ТТН создана",
  IN_TRANSIT: "В пути",
  ARRIVED: "В отделении",
  RECEIVED: "Получена",
  REFUSED: "Отказ",
  RETURNING: "Возвращается",
  CANCELLED: "ТТН отменена",
  NOT_FOUND: "НП не знает номер",
};

export type StageTone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

export const STAGE_TONE: Record<ShipmentStage, StageTone> = {
  CREATED: "accent",
  IN_TRANSIT: "info",
  ARRIVED: "warn",
  RECEIVED: "ok",
  REFUSED: "danger",
  RETURNING: "warn",
  CANCELLED: "neutral",
  NOT_FOUND: "danger",
};

/** Заказ хранит WAREHOUSE / POSTOMAT / DOORS, ТТН и API НП — WarehouseWarehouse / …: известны оба. */
export const SERVICE_LABEL: Record<string, string> = {
  WAREHOUSE: "В отделение",
  POSTOMAT: "В почтомат",
  DOORS: "Курьером",
  WarehouseWarehouse: "В отделение",
  WarehousePostomat: "В почтомат",
  WarehouseDoors: "Курьером",
};

export function serviceLabel(type: string | null | undefined): string | null {
  return type ? (SERVICE_LABEL[type] ?? type) : null;
}

/** Незнакомая стадия (бэкенд новее) показывается как есть, нейтрально. */
export function stageLabel(stage: string | null | undefined): string {
  return (stage && STAGE_LABEL[stage as ShipmentStage]) || stage || "—";
}

export function stageTone(stage: string | null | undefined): StageTone {
  return (stage && STAGE_TONE[stage as ShipmentStage]) || "neutral";
}

/** НП ещё не сканировала посылку, ТТН наша: её можно править и удалять. */
export function shipmentEditable(s: Pick<Shipment, "origin" | "stage"> | null | undefined): boolean {
  if (!s || s.origin !== "API") return false;
  return s.stage === "CREATED" || s.stage === "NOT_FOUND";
}

export const LABEL_FORMATS: { value: LabelFormat; label: string }[] = [
  { value: "100x100", label: "100×100" },
  { value: "85x85", label: "85×85" },
  { value: "a4", label: "A4" },
];

/** Код бэкенда: ТТН для заказа без пришедшей онлайн-оплаты. */
export const SHIP_UNPAID_CODE = "ORDER_UNPAID_SHIP";
/** Код бэкенда: у заказа уже есть активная ТТН. */
export const SHIPMENT_EXISTS_CODE = "SHIPMENT_EXISTS";
