"use client";

import { useEffect, useState } from "react";
import { localStore } from "@shop/core/storage";

const COLLAPSE_KEY = "admin-sidebar-collapsed";

/** Desktop rail state, remembered per browser (a convenience — falls back to expanded). */
export function useCollapsedSidebar(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStore.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage blocked — stay expanded */
    }
  }, []);
  function toggle() {
    setCollapsed((v) => {
      try {
        localStore.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  }
  return [collapsed, toggle];
}
