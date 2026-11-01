import type { Schemas } from "@shop/core/api/schemas";

/** Один счёт monobank заказа (GET /api/admin/orders/{id}/payments); статус — известный набор. */
export type AdminInvoice = Schemas["AdminInvoiceDto"];
export type MonobankStatus = Schemas["MonobankStatusDto"];
/** Способ оплаты у админа: с выключенными и порядком. */
export type PaymentOptionFull = Schemas["AdminPaymentOptionDto"];
/** Заказ в той части, что нужна оплате. */
export type PaymentOrder = Schemas["OrderDetailDto"];
