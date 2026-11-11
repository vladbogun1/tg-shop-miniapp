/**
 * Посылка «Нової пошти» в заказе покупателя: стадия, тон, ключ текста и ссылка «Відстежити».
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

const TRACKING_BASE = "https://novaposhta.ua/tracking/?cargo_number=";

/** Номер ТТН заказа (поле заказа или посылки), без пробелов; null — ТТН нет. */
export function parcelTtn(o: { trackingNumber?: string | null; shipment?: { ttn?: string | null } | null }): string | null {
  const ttn = (o.trackingNumber ?? o.shipment?.ttn ?? "").replace(/\s+/g, "");
  return ttn || null;
}

/**
 * Ссылка «Відстежити»: `trackingUrl` сервера (только http/https), иначе публичная страница НП по номеру ТТН.
 * Null без ТТН.
 */
export function trackingLink(o: {
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  shipment?: { ttn?: string | null; trackingUrl?: string | null } | null;
}): string | null {
  const ttn = parcelTtn(o);
  if (!ttn) return null;
  const url = o.trackingUrl ?? o.shipment?.trackingUrl ?? null;
  if (url && /^https?:\/\//i.test(url)) return url;
  return TRACKING_BASE + encodeURIComponent(ttn);
}
