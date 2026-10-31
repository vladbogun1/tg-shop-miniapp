/**
 * Admin v2 endpoints of the payment screen.
 *
 * Kept next to `api.ts` (same http client) instead of inside it so the parallel admin-v2 packages
 * do not all edit one file. Types here extend the older DTOs with the fields the backend now sends.
 */
import { apiGet, apiPut, type PaymentOption } from "./api";

// ---- payment ----------------------------------------------------------------
export type PaymentOptionFull = PaymentOption & { sortOrder?: number; active?: boolean };

export const extApi = {
  // payment
  /** All options incl. switched-off ones, in checkout order. */
  paymentOptionsAll: () =>
    apiGet<PaymentOptionFull[]>("/api/admin/payment-options?includeInactive=true"),
  putPaymentOptions: (list: PaymentOptionFull[]) =>
    apiPut<PaymentOptionFull[]>("/api/admin/payment-options", list),
};
