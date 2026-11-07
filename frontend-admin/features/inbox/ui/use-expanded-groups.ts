"use client";

import { createStorage } from "@shop/core/storage";
import { useCallback, useEffect, useState } from "react";

const store = createStorage("session", "admin-inbox-");
const KEY = "expanded-groups";

/** Groups opened with «Показать все N» — remembered for the tab session, so a refresh does not fold them back. */
export function useExpandedGroups(): { isExpanded: (id: string) => boolean; toggle: (id: string) => void } {
  const [ids, setIds] = useState<string[]>([]);

  // Read after mount: the first render must match the server one.
  useEffect(() => {
    const saved = store.getJson<string[]>(KEY);
    if (Array.isArray(saved)) setIds(saved.filter((x) => typeof x === "string"));
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      store.setJson(KEY, next);
      return next;
    });
  }, []);

  return { isExpanded: (id) => ids.includes(id), toggle };
}
