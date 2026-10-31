import { QUERY_PRESETS } from "@shop/core/query";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { isAuthenticated } from "@/lib/session";
import { inboxApi } from "./api";
import { inboxKeys } from "./keys";

/** Тот же опрос раз в 30 с, что у пресета live; staleTime — по умолчанию клиента (как раньше). */
const REFETCH_MS = QUERY_PRESETS.live.refetchInterval;

/**
 * Everything waiting for the owner. The same query feeds the page, the menu badge and the bell, so they
 * always show one number. Polls every 30 s and on focus; other screens refetch it right after acting
 * on an order or chat.
 */
export function useInbox() {
  return useQuery({
    queryKey: inboxKeys.all(),
    queryFn: inboxApi.get,
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
    enabled: isAuthenticated(),
  });
}

export function refreshInbox(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: inboxKeys.all() });
}
