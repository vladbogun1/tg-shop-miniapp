import { apiGet } from "@/lib/http";
import type { SearchResults } from "./model/hits";

export const searchApi = {
  /** До 5 заказов, товаров и покупателей по запросу; короче двух символов — пустые группы. */
  find: (q: string) => apiGet<SearchResults>(`/api/admin/search?q=${encodeURIComponent(q)}`),
};
