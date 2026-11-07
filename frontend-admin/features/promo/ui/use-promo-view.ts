"use client";

import { nowMs } from "@shop/core/time";
import { useEffect, useMemo, useState } from "react";
import { useDebounced } from "@/lib/use-debounced";
import { filterCodes, filterManual, groupByTab, type StateFilter } from "../model/promo";
import type { ManualDiscountOrder, PromoCode, PromoOrigin } from "../model/types";
import { useManualDiscounts, usePromoPage, usePromocodes } from "../queries";

export const CASE_PAGE_SIZE = 25;

/**
 * Что показывает вкладка. «Наши / Персональные / За отзывы» — из общего списка (поиск и состояние на
 * клиенте); «Из кейса» (сотни кодов) — страница с сервера: поиск, состояние и пагинация в базе.
 */
export function usePromoView(tab: PromoOrigin, query: string, state: StateFilter) {
  const promosQ = usePromocodes();
  const manualQ = useManualDiscounts();
  const promos = useMemo(() => promosQ.data ?? [], [promosQ.data]);
  const manual = useMemo(() => manualQ.data ?? [], [manualQ.data]);
  const byTab = useMemo(() => groupByTab(promos), [promos]);

  const [page, setPage] = useState(0);
  const q = useDebounced(query);
  const serverTab = tab === "CASE";
  useEffect(() => {
    setPage(0);
  }, [tab, q, state]);
  const pageQ = usePromoPage({ origin: "CASE", q, state, page, size: CASE_PAGE_SIZE }, serverTab);

  const counts: Record<PromoOrigin, number> = {
    OURS: byTab.OURS.length,
    PERSONAL: byTab.PERSONAL.length + manual.length,
    REVIEW: byTab.REVIEW.length,
    CASE: pageQ.data?.originTotal ?? byTab.CASE.length,
  };
  const now = nowMs();
  const shown: PromoCode[] = serverTab ? (pageQ.data?.items ?? []) : filterCodes(byTab[tab], query, state, now);
  const shownManual: ManualDiscountOrder[] = filterManual(manual, tab, query, state);
  const active = serverTab ? pageQ : promosQ;
  return {
    byTab,
    counts,
    countsReady: promosQ.isSuccess,
    now,
    shown,
    shownManual,
    pager: serverTab && pageQ.data ? { page, size: CASE_PAGE_SIZE, total: pageQ.data.total, onPage: setPage } : null,
    isLoading: promosQ.isLoading || (serverTab && pageQ.isLoading),
    isError: active.isError,
    error: active.error,
    refetch: () => void active.refetch(),
  };
}
