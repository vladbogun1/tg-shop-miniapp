/**
 * Time-range helper shared by the board, table, and metrics views.
 * Persists the chosen range in localStorage so it survives navigation.
 */
import { useEffect, useState } from "react";
import type { TimeRange } from "./api";

export const RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "month", label: "Месяц" },
  { value: "halfyear", label: "Полгода" },
  { value: "year", label: "Год" },
  { value: "all", label: "Всё" },
];

const STORAGE_KEY = "tgshop_admin_range";
const DEFAULT_RANGE: TimeRange = "month";

function isRange(v: unknown): v is TimeRange {
  return v === "month" || v === "halfyear" || v === "year" || v === "all";
}

export function getStoredRange(): TimeRange {
  if (typeof window === "undefined") return DEFAULT_RANGE;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return isRange(v) ? v : DEFAULT_RANGE;
}

/** Stateful range, persisted to localStorage. SSR-safe (starts at default). */
export function useTimeRange(): [TimeRange, (r: TimeRange) => void] {
  const [range, setRange] = useState<TimeRange>(DEFAULT_RANGE);

  // hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setRange(getStoredRange());
  }, []);

  function update(r: TimeRange) {
    setRange(r);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, r);
    }
  }

  return [range, update];
}
