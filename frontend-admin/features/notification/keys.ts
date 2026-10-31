/** Ключи кэша фичи. Инвалидация — только по этим фабрикам. */
export const notificationKeys = {
  audiences: (lang: string) => ["broadcast-audiences", lang] as const,
  status: () => ["broadcast-status"] as const,
  history: () => ["broadcast-history"] as const,
};
