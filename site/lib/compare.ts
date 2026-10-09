"use client";

/**
 * Comparison list of the website — product ids in localStorage (`compare-v1`), see
 * shared/src/compare.ts for why ids only and how groups work. Also holds the modal's open state, so
 * a card, the product page and the header can all open it.
 *
 * Several tabs: a `storage` event re-reads the list, so adding in one tab updates the badge in the
 * others.
 */
import { useEffect } from "react";
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
import { toast } from "@/components/ui/Toast";
import type { TFunction } from "@/i18n";
import { trackCompare } from "./analytics";

interface CompareState {
  entries: CompareEntry[];
  open: boolean;
  /** Group to show first when the modal opens (the product just added). */
  focusGroup: string | null;
  add: (id: string, group: string) => CompareAddResult;
  remove: (id: string) => void;
  removeGroup: (group: string) => void;
  /** Drops ids the catalog no longer has. */
  prune: (alive: Set<string>) => void;
  openModal: (group?: string | null) => void;
  closeModal: () => void;
}

export const useCompare = create<CompareState>()(
  persist(
    (set, get) => ({
      entries: [],
      open: false,
      focusGroup: null,
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
      openModal: (group = null) => set({ open: true, focusGroup: group }),
      closeModal: () => set({ open: false }),
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

/** Keeps the list in step with other tabs. Mounted once in Providers. */
export function CompareTabSync() {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === COMPARE_STORAGE_KEY) void useCompare.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}

/**
 * Add/remove from a button, with the toast that tells what happened. Returns true when the product
 * is in the list afterwards.
 */
export function toggleCompare(id: string, group: string, t: TFunction): boolean {
  const s = useCompare.getState();
  if (s.entries.some((e) => e.id === id)) {
    s.remove(id);
    toast(t("compare.removed"));
    return false;
  }
  const result = s.add(id, group);
  if (result === "added") {
    trackCompare("compare_add", id);
    const n = useCompare.getState().entries.filter((e) => e.group === group).length;
    // always with the button: a toast that grew a button on the second add changed size and jumped
    toast(t("compare.added", { n }), "ok", { label: t("compare.open"), onClick: () => useCompare.getState().openModal(group) });
    return true;
  }
  if (result === "group-full") toast(t("compare.groupFull", { n: COMPARE_MAX_PER_GROUP }), "error");
  if (result === "total-full") toast(t("compare.totalFull", { n: COMPARE_MAX_TOTAL }), "error");
  return false;
}
