/** Ключи кэша фичи. Инвалидация — только по этим фабрикам. */
export const settingsKeys = {
  all: () => ["shop-settings"] as const,
  system: () => ["settings-system"] as const,
  pushConfig: () => ["admin", "push-config"] as const,
  /** Принадлежит «Вниманию» (inbox); пороги там зависят от настроек. */
  inbox: () => ["admin", "inbox"] as const,
};
