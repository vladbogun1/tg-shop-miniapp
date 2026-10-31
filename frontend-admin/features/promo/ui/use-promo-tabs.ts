"use client";

import { useEffect, useState } from "react";
import { tabFromSearch, tabSearch } from "../model/promo";
import type { PromoOrigin } from "../model/types";

/** Вкладка в адресе (`?tab=personal|review`), чтобы перезагрузка и ссылка её сохраняли. */
export function usePromoTab() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<PromoOrigin>("OURS");
  useEffect(() => {
    const t = tabFromSearch(window.location.search);
    if (t) setTab(t);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    window.history.replaceState(null, "", window.location.pathname + tabSearch(tab));
  }, [ready, tab]);
  return { tab, setTab, ready };
}
