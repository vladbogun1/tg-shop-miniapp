import type { Schemas } from "@shop/core/api/schemas";
import type { OnlinePaymentStatus } from "@shop/core/types";

/** Один счёт monobank заказа (GET /api/admin/orders/{id}/payments); статус — известный набор. */
export type AdminInvoice = Omit<Schemas["AdminInvoiceDto"], "status"> & { status: OnlinePaymentStatus };
export type MonobankStatus = Schemas["MonobankStatusDto"];
/** Способ оплаты у админа: с выключенными и порядком. */
export type PaymentOptionFull = Schemas["AdminPaymentOptionDto"];
/** Заказ в той части, что нужна оплате. */
export type PaymentOrder = Schemas["OrderDetailDto"];
