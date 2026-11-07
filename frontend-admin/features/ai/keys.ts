/** Ключи кэша фичи. Инвалидация — только по этим фабрикам. */
export const aiKeys = {
  state: () => ["admin", "ai", "state"] as const,
  job: (id: number) => ["admin", "ai", "job", id] as const,
  active: () => ["admin", "ai", "active"] as const,
};
