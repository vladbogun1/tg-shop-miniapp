/** Ключи кэша Новой Почты в админке. */
export const deliveryKeys = {
  all: () => ["np"] as const,
  /** Предпросмотр ТТН: `options` — JSON формы (пустой объект — значения по умолчанию). */
  preview: (orderId: string, options: string) => ["np", "preview", orderId, options] as const,
  sender: () => ["np", "sender"] as const,
  /** Связанные ТТН заказа; `polledAt` — когда опрашивали посылку (новый опрос мог найти новую связь). */
  links: (orderId: string, polledAt: string) => ["np", "links", orderId, polledAt] as const,
  /** «Коробки» (GET /api/admin/np/boxes). */
  boxes: () => ["np", "boxes"] as const,
  packingJournal: (days: number) => ["np", "packing-journal", days] as const,
  /** Проверка «Упаковано» до нажатия: `body` — JSON выбранной коробки и веса. */
  packCheck: (orderId: string, body: string) => ["np", "pack-check", orderId, body] as const,
  webhook: () => ["np", "webhook"] as const,
  productSize: (id: string) => ["np", "size", "product", id] as const,
  categorySizes: () => ["np", "size", "categories"] as const,
};
