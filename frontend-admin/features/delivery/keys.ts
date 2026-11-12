/** Ключи кэша Новой Почты в админке. */
export const deliveryKeys = {
  all: () => ["np"] as const,
  /** Предпросмотр ТТН: `options` — JSON формы (пустой объект — значения по умолчанию). */
  preview: (orderId: string, options: string) => ["np", "preview", orderId, options] as const,
  sender: () => ["np", "sender"] as const,
  /** «Коробки» (GET /api/admin/np/boxes). */
  boxes: () => ["np", "boxes"] as const,
  packingJournal: (days: number) => ["np", "packing-journal", days] as const,
  webhook: () => ["np", "webhook"] as const,
  productSize: (id: string) => ["np", "size", "product", id] as const,
  categorySizes: () => ["np", "size", "categories"] as const,
};
