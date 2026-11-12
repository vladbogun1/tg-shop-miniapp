/**
 * Ссылка «Відстежити» посылки «Нової пошти» и номер ТТН — страница заказа покупателя (сайт и Mini App).
 */

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
