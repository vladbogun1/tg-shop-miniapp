"use client";

import { useCallback, useEffect, useState } from "react";
import type { BoardKey } from "../model/status";

const FLAG = "ordersStatus";

/** Keeps Next's own history state (it lives in the same object) and adds or drops our flag. */
function stateWith(status: BoardKey | null): Record<string, unknown> {
  const rest = { ...(window.history.state ?? {}) } as Record<string, unknown>;
  delete rest[FLAG];
  return status ? { ...rest, [FLAG]: status } : rest;
}

/**
 * Phone: which status is open (null — the list of statuses). Opening pushes a history entry, so the
 * system «back» (swipe / hardware) returns to the list instead of leaving the orders page, and
 * «forward» opens the status again. `show` sets the status without history (a deep link such as
 * /?status=NEW); «‹» from such a status drops the query, so a reload does not reopen it.
 */
export function useStatusNav(): { tab: BoardKey | null; open: (s: BoardKey) => void; back: () => void; show: (s: BoardKey | null) => void } {
  const [tab, setTab] = useState<BoardKey | null>(null);

  useEffect(() => {
    const onPop = () => setTab((window.history.state?.[FLAG] as BoardKey | undefined) ?? null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = useCallback((s: BoardKey) => {
    window.history.pushState(stateWith(s), "");
    setTab(s);
    window.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => {
    if (window.history.state?.[FLAG]) {
      window.history.back();
      return;
    }
    if (window.location.search) window.history.replaceState(stateWith(null), "", window.location.pathname);
    setTab(null);
  }, []);

  return { tab, open, back, show: setTab };
}
