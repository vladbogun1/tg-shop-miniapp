/** Общие тексты доставки вне оформления — English. Те же ключи, что в `delivery-ru.ts`. */
import type { deliveryRu } from "./delivery-ru";

export const deliveryEn: Record<keyof typeof deliveryRu, string> = {
  "cart.deliveryNote": "Shipping is paid separately to Nova Poshta on receipt — it is not part of the order total.",
  "parcel.title": "Parcel",
  "parcel.track": "Track",
  "parcel.cod": "To pay on receipt: {amount}",
  "parcel.stage.CREATED": "Preparing to ship",
  "parcel.stage.IN_TRANSIT": "On its way",
  "parcel.stage.ARRIVED": "Arrived — ready for pickup",
  "parcel.stage.RECEIVED": "Received",
  "parcel.stage.REFUSED": "Refused",
  "parcel.stage.RETURNING": "Returning to sender",
  "parcel.stage.CANCELLED": "Shipment cancelled",
  "parcel.stage.NOT_FOUND": "Checking the status",
  "delivery.cost.note": "The total excludes shipping: you pay it separately to Nova Poshta on receipt, not to us.",
};
