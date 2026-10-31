"use client";

/**
 * The metrics page's own period + channel, remembered per browser. It used to share
 * `tgshop_admin_range` with the orders board, so picking "Год" here changed the kanban filter.
 */
import { localStore } from "@shop/core/storage";
import { useEffect, useState } from "react";
import { DEFAULT_PERIOD, isValid } from "../model/period";
import type { PeriodParams } from "../model/types";

const KEY = "tgshop_admin_metrics_period";

export function useMetricsPeriod(): [PeriodParams, (p: PeriodParams) => void] {
  const [value, setValue] = useState<PeriodParams>(DEFAULT_PERIOD);

  useEffect(() => {
    try {
      const raw = localStore.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValid(parsed)) setValue(parsed);
      }
    } catch {
      /* private mode / bad JSON: keep the default */
    }
  }, []);

  function update(p: PeriodParams) {
    setValue(p);
    try {
      localStore.setItem(KEY, JSON.stringify(p));
    } catch {
      /* not worth surfacing */
    }
  }

  return [value, update];
}
