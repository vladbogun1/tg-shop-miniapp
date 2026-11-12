/**
 * Посылка «Нової пошти» в заказе покупателя: стадия, цвет чипа, ключ текста. Ссылка «Відстежити» — parcel-tracking.ts
 * (нужна только странице заказа; чип стадии стоит и в списке заказов — бюджет бандла).
 */
import type { ShipmentStage } from "../delivery/contract";

/**
 * Цвет чипа каждой стадии; ключи таблицы — заодно список известных стадий. Цвета — токены обоих приложений с двойником
 * `--<имя>-rgb`: подложка чипа строится `tint()` из @shop/ui/tint (inline `color-mix()` Safari < 16.2 выбрасывает,
 * docs/BROWSER-SUPPORT.md). В пути — синий, получена — зелёный, отказ/возврат — жёлтый, отмена/потеря — красный.
 */
const STAGE_COLOR: Record<ShipmentStage, string> = {
  CREATED: "var(--faint)",
  IN_TRANSIT: "var(--st-new)",
  ARRIVED: "var(--st-new)",
  RECEIVED: "var(--ok)",
  REFUSED: "var(--warn)",
  RETURNING: "var(--warn)",
  CANCELLED: "var(--danger)",
  NOT_FOUND: "var(--danger)",
};

export function parcelStageColor(stage: ShipmentStage): string {
  return STAGE_COLOR[stage];
}

/** Ключ словаря текста стадии: `parcel.stage.<STAGE>`. */
export function parcelStageKey(stage: ShipmentStage): `parcel.stage.${ShipmentStage}` {
  return `parcel.stage.${stage}`;
}

/** Стадия посылки заказа, если сервер прислал известную. */
export function parcelStageOf(o: { shipmentStage?: string | null; shipment?: { stage?: string | null } | null }): ShipmentStage | null {
  const raw = o.shipmentStage ?? o.shipment?.stage ?? null;
  return raw && Object.prototype.hasOwnProperty.call(STAGE_COLOR, raw) ? (raw as ShipmentStage) : null;
}
