"use client";

import { useEffect, useState } from "react";

/**
 * Debounced mirror of a rapidly changing value (typically a search box).
 *
 * The board's query key included the raw input, so every keystroke fired a fresh request for the
 * heaviest endpoint in the admin — typing "Иванов" meant six full board loads.
 */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
