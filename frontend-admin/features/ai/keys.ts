/** Ключи кэша фичи. Инвалидация — только по этим фабрикам. */
export const aiKeys = {
  summary: () => ["admin", "ai", "summary"] as const,
  estimate: (feature: string) => ["admin", "ai", "estimate", feature] as const,
  state: () => ["admin", "ai", "state"] as const,
  job: (id: number) => ["admin", "ai", "job", id] as const,
  active: () => ["admin", "ai", "active"] as const,
};
