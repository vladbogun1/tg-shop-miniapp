"use client";

/**
 * Comparison list of the Mini App — product ids in localStorage (`compare-v1`, the Telegram webview
 * keeps it like the cart's), see shared/src/compare.ts for why ids only and how groups work. Also
 * holds whether the comparison screen is open and its own toast (the card, the product view and the
 * screen all add/remove, and the toast has a button that opens the screen).
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  COMPARE_MAX_PER_GROUP,
  COMPARE_MAX_TOTAL,
  COMPARE_STORAGE_KEY,
  compareAdd,
  parseCompareEntries,
  type CompareAddResult,
  type CompareEntry,
} from "@shop/shared";
import { track } from "./analytics";

export interface CompareToast {
  id: number;
  text: string;
  kind: "ok" | "error";
  /** Group to open from the toast's button; null = no button. */
  openGroup: string | null;
}

interface CompareState {
  entries: CompareEntry[];
  open: boolean;
  focusGroup: string | null;
  toast: CompareToast | null;
  add: (id: string, group: string) => CompareAddResult;
  remove: (id: string) => void;
  removeGroup: (group: string) => void;
  prune: (alive: Set<string>) => void;
  openScreen: (group?: string | null) => void;
  closeScreen: () => void;
  showToast: (text: string, kind?: "ok" | "error", openGroup?: string | null) => void;
  hideToast: () => void;
}

export const useCompare = create<CompareState>()(
  persist(
    (set, get) => ({
      entries: [],
      open: false,
      focusGroup: null,
      toast: null,
      add: (id, group) => {
        const r = compareAdd(get().entries, id, group);
        if (r.result === "added") set({ entries: r.entries });
        return r.result;
      },
      remove: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      removeGroup: (group) => set((s) => ({ entries: s.entries.filter((e) => e.group !== group) })),
      prune: (alive) => {
        const next = get().entries.filter((e) => alive.has(e.id));
        if (next.length !== get().entries.length) set({ entries: next });
      },
      openScreen: (group = null) => {
        track("compare_open", undefined, JSON.stringify({ count: get().entries.length }));
        set({ open: true, focusGroup: group, toast: null });
      },
      closeScreen: () => set({ open: false }),
      showToast: (text, kind = "ok", openGroup = null) => set((s) => ({ toast: { id: (s.toast?.id ?? 0) + 1, text, kind, openGroup } })),
      hideToast: () => set({ toast: null }),
    }),
    {
      name: COMPARE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ entries: s.entries }),
      merge: (persisted, current) => ({ ...current, entries: parseCompareEntries((persisted as { entries?: unknown })?.entries) }),
    },
  ),
);

export function useCompareCount(): number {
  return useCompare((s) => s.entries.length);
}

export function useInCompare(id: string): boolean {
  return useCompare((s) => s.entries.some((e) => e.id === id));
}

/** Add/remove from a button + the toast that tells what happened. True = in the list afterwards. */
export function toggleCompare(id: string, group: string, t: (key: string, params?: Record<string, string | number>) => string): boolean {
  const s = useCompare.getState();
  if (s.entries.some((e) => e.id === id)) {
    s.remove(id);
    s.showToast(t("compare.removed"));
    return false;
  }
  const result = s.add(id, group);
  if (result === "added") {
    track("compare_add", undefined, JSON.stringify({ productId: id }));
    const n = useCompare.getState().entries.filter((e) => e.group === group).length;
    s.showToast(t("compare.added", { n }), "ok", n >= 2 ? group : null);
    return true;
  }
  if (result === "group-full") s.showToast(t("compare.groupFull", { n: COMPARE_MAX_PER_GROUP }), "error");
  if (result === "total-full") s.showToast(t("compare.totalFull", { n: COMPARE_MAX_TOTAL }), "error");
  return false;
}
