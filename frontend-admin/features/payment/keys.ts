/** Ключи кэша оплаты. Значения прежние: по ним инвалидируют и соседние экраны. */
export const paymentKeys = {
  invoices: (orderId: string) => ["order-payments", orderId] as const,
  receipts: (orderId: string) => ["order-receipts", orderId] as const,
  options: (variant: "all" | "active") => ["payment-options", variant] as const,
  monobank: () => ["monobank-status"] as const,
};
