/** Ключи кэша фичи. Инвалидация — только по этим фабрикам. */
export const aiKeys = {
  summary: () => ["admin", "ai", "summary"] as const,
  estimate: (feature: string) => ["admin", "ai", "estimate", feature] as const,
  state: () => ["admin", "ai", "state"] as const,
  job: (id: number) => ["admin", "ai", "job", id] as const,
  active: () => ["admin", "ai", "active"] as const,
  tasks: (tab: string, page: number) => ["admin", "ai", "tasks", tab, page] as const,
  tasksAll: () => ["admin", "ai", "tasks"] as const,
  widget: () => ["admin", "ai", "widget"] as const,
  batches: () => ["admin", "ai", "batches"] as const,
  batch: (id: number) => ["admin", "ai", "batches", id] as const,
  batchEstimate: (feature: string, count: number) => ["admin", "ai", "batch-estimate", feature, count] as const,
  financeFlag: () => ["admin", "ai", "finance-flag"] as const,
  metrics: (from: string, to: string) => ["admin", "ai", "metrics", from, to] as const,
  series: (group: string, from: string, to: string) => ["admin", "ai", "metrics", "series", group, from, to] as const,
};
