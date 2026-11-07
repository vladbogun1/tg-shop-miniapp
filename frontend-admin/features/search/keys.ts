/** Ключи кэша поиска палитры Ctrl+K. */
export const searchKeys = {
  all: () => ["admin", "search"] as const,
  find: (q: string) => ["admin", "search", q] as const,
};
