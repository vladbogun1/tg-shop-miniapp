"use client";

import { nowMs } from "@shop/core/time";
import { useEffect, useState } from "react";

/** Текущее время, обновляется раз в полминуты: подписи «ждёт 2 ч 40 мин» не застывают. */
export function useNowMs(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => nowMs());
  useEffect(() => {
    const t = setInterval(() => setNow(nowMs()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
