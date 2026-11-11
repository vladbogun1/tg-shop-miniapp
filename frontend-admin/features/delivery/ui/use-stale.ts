"use client";

import { useEffect, useState } from "react";
import type { Shipment } from "../model/types";

/** Сколько раз перечитать заказ, пока сервер обновляет ненапечатанную ТТН, и с каким шагом. */
const SETTLE_TRIES = 4;
const SETTLE_STEP_MS = 2500;

export interface StaleState {
  reasons: string[];
  /** Ключ «эта ТТН + эти причины»: окно показывается один раз на ключ. */
  key: string;
  /** Ненапечатанную ТТН сервер правит сам — ждём, перечитывая заказ. */
  settling: boolean;
  /** ТТН устарела окончательно: с ней посылку не отправлять. */
  stale: boolean;
}

/**
 * «ТТН устарела» (владелец, 2026-10-24): заказ изменился после ТТН. Ненапечатанную сервер обновляет в фоне —
 * перечитываем заказ до 4 раз; напечатанная (НП её не меняет) или не обновившаяся — устарела.
 */
export function useStaleShipment(s: Shipment | null, watch: boolean, reload: () => void): StaleState {
  const [polls, setPolls] = useState<{ key: string; n: number }>({ key: "", n: 0 });
  const reasons = (watch && s?.staleReasons) || [];
  const key = reasons.length > 0 && s ? `${s.ttn}|${reasons.join("|")}` : "";
  const tries = polls.key === key ? polls.n : 0;
  const settling = !!key && !s?.printedAt && tries < SETTLE_TRIES;

  useEffect(() => {
    if (!settling) return;
    const t = setTimeout(() => {
      setPolls({ key, n: tries + 1 });
      reload();
    }, SETTLE_STEP_MS);
    return () => clearTimeout(t);
  }, [settling, key, tries, reload]);

  return { reasons, key, settling, stale: !!key && !settling };
}
