/** Ключи кэша фичи. Инвалидация — только по этим фабрикам. */
export const siteKeys = {
  status: () => ["site-revalidate-status"] as const,
};
