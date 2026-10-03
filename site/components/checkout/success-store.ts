/**
 * Hand-over between the checkout and the success page. The requisites come back with
 * CreateOrderResponse, so they are kept in sessionStorage for the very next screen; if that is gone
 * (reload in another tab, direct link) the success page falls back to GET /api/me/orders/{id}.
 */
import type { PaymentRequisites } from "@shop/shared";

export interface SuccessInfo {
  orderId: string;
  requisites: PaymentRequisites | null;
  paymentTitle: string;
  totalMinor: number;
  dueNowMinor: number;
  currency: string;
}

const KEY = "site-last-order";

export function saveSuccess(info: SuccessInfo): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(info));
  } catch {
    /* the success page will fetch the order instead */
  }
}

export function readSuccess(orderId: string): SuccessInfo | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const info = raw ? (JSON.parse(raw) as SuccessInfo) : null;
    return info && info.orderId === orderId ? info : null;
  } catch {
    return null;
  }
}
