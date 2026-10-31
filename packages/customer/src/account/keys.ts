/**
 * Ключи кэша react-query «моего кабинета» — единственное место (docs/ARCHITECTURE-FRONT.md, 2.5).
 * Значения не менять: те же ключи читают и сбрасывают экраны приложений. `root` — префикс всего «моего»
 * (сброс при выходе).
 */
export const meKeys = {
  root: ["me"] as const,
  sessions: ["me", "sessions"] as const,
  lastOrder: ["me", "last-order"] as const,
  /** Mini App: бейдж непрочитанных сообщений. */
  unreadCount: ["me", "unread-count"] as const,
  /** Mini App: список переписок в окне уведомлений. */
  conversations: ["me", "conversations"] as const,
};
