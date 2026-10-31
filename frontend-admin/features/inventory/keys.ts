/** Ключи кэша фичи. */
export const inventoryKeys = {
  /** Корень: все отчёты по периодам. */
  all: () => ["writeoffs"] as const,
  report: (range: string) => ["writeoffs", range] as const,
};
