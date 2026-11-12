/**
 * Посылка «Нової пошти» в заказе покупателя: стадия, тон, ключ текста. Ссылка «Відстежити» — parcel-tracking.ts
 * (нужна только странице заказа; чип стадии стоит и в списке заказов — бюджет бандла).
 */
import type { ShipmentStage } from "../delivery/contract";

const STAGES: readonly ShipmentStage[] = ["CREATED", "IN_TRANSIT", "ARRIVED", "RECEIVED", "REFUSED", "RETURNING", "CANCELLED", "NOT_FOUND"];

export type ParcelTone = "info" | "ok" | "warn" | "danger" | "muted";

export function parcelTone(stage: ShipmentStage): ParcelTone {
  switch (stage) {
    case "RECEIVED":
      return "ok";
    case "ARRIVED":
    case "IN_TRANSIT":
      return "info";
    case "REFUSED":
    case "RETURNING":
      return "warn";
    case "CANCELLED":
    case "NOT_FOUND":
      return "danger";
    default:
      return "muted";
  }
}

/**
 * Цвет тона — токены обоих приложений с двойником `--<имя>-rgb`: подложка чипа строится `tint()` из @shop/ui/tint
 * (inline `color-mix()` Safari < 16.2 выбрасывает, docs/BROWSER-SUPPORT.md).
 */
export const PARCEL_TONE_COLOR: Record<ParcelTone, string> = {
  info: "var(--st-new)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  muted: "var(--faint)",
};

/** Ключ словаря текста стадии: `parcel.stage.<STAGE>`. */
export function parcelStageKey(stage: ShipmentStage): `parcel.stage.${ShipmentStage}` {
  return `parcel.stage.${stage}`;
}

/** Стадия посылки заказа, если сервер прислал известную. */
export function parcelStageOf(o: { shipmentStage?: string | null; shipment?: { stage?: string | null } | null }): ShipmentStage | null {
  const raw = o.shipmentStage ?? o.shipment?.stage ?? null;
  return raw && (STAGES as readonly string[]).includes(raw) ? (raw as ShipmentStage) : null;
}
