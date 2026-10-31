"use client";

import { localStore } from "@shop/core/storage";
import { useEffect, useState } from "react";
import { DEFAULT_PERIOD, isValidPeriod, PERIOD_STORAGE_KEY, type OrdersPeriod } from "../model/period";

/** Stateful period, persisted to localStorage. SSR-safe (starts at the default). */
export function useOrdersPeriod(): [OrdersPeriod, (p: OrdersPeriod) => void] {
  const [value, setValue] = useState<OrdersPeriod>(DEFAULT_PERIOD);

  useEffect(() => {
    try {
      const raw = localStore.getItem(PERIOD_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValidPeriod(parsed)) setValue(parsed);
      }
    } catch {
      /* private mode / bad JSON: keep the default */
    }
  }, []);

  function update(p: OrdersPeriod) {
    setValue(p);
    try {
      localStore.setItem(PERIOD_STORAGE_KEY, JSON.stringify(p));
    } catch {
      /* not worth surfacing */
    }
  }

  return [value, update];
}
