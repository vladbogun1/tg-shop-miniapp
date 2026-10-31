import type { ReviewFilter } from "./model/types";

const ROOT = ["admin", "reviews"] as const;

/** Ключи кэша фичи; всё под одним корнем, чтобы действие модерации обновило и список, и бейдж меню. */
export const reviewKeys = {
  all: () => ROOT,
  list: (status: ReviewFilter, productId: string | null, page: number) => [...ROOT, status, productId, page] as const,
  pendingCount: () => [...ROOT, "pending-count"] as const,
};
