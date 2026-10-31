/**
 * Ключи кэша заказов. Значения совпадают с прежними литералами: по ним инвалидируют и другие экраны
 * (отправка, «Внимание», поддержка), пока они не перешли на фабрики.
 */
export const orderKeys = {
  all: () => ["order"] as const,
  detail: (id: string | null) => ["order", id] as const,
  audit: (id: string | null) => ["order-audit", id] as const,
  messages: (id: string | null) => ["messages", id] as const,
  board: () => ["board"] as const,
  table: () => ["orders-table"] as const,
  tableFilter: (search: string, period: unknown, status: unknown, page: number, sortBy: unknown, sortDir: unknown, archived: unknown) =>
    ["orders-table", search, period, status, page, sortBy, sortDir, archived] as const,
  dispatch: () => ["dispatch"] as const,
  inbox: () => ["admin", "inbox"] as const,
  mergeCandidates: (id?: string | null) => (id === undefined ? (["merge-candidates"] as const) : (["merge-candidates", id] as const)),
  giftLimit: (id: string | null) => ["gift-limit", id] as const,
  replyTemplates: () => ["reply-templates"] as const,
  replyTemplatesFor: (id: string | null) => ["reply-templates", "order", id] as const,
  /** Списки других фич, которые заказ обновляет. */
  products: () => ["products"] as const,
  productsActive: () => ["products", false] as const,
  metrics: () => ["metrics2"] as const,
  giftTiers: () => ["gift", "tiers"] as const,
};
