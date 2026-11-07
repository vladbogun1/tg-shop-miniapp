import type { ReviewListParams } from "./model/types";

const ROOT = ["admin", "reviews"] as const;

/** Ключи кэша фичи; всё под одним корнем, чтобы действие модерации обновило и список, и бейдж меню. */
export const reviewKeys = {
  all: () => ROOT,
  list: (p: ReviewListParams) =>
    [...ROOT, p.status, p.productId ?? null, p.q?.trim() ?? "", (p.ratings ?? []).join(","), !!p.unanswered, p.page] as const,
  pendingCount: () => [...ROOT, "pending-count"] as const,
};
