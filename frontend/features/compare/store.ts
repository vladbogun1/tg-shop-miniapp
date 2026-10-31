"use client";

/**
 * Comparison list of the Mini App — the shared store of `@shop/customer/compare` (ids in localStorage `compare-v1`)
 * plus the Mini App's own toast: the card, the product view and the screen all add/remove, and the toast has a button
 * that opens the screen.
 */
import type { LooseT } from "@shop/core/i18n";
import { create } from "zustand";
import { createCompareStore } from "@shop/customer/compare/store";
import { toggleCompareIn } from "@shop/customer/compare/toggle";
import { track } from "@/lib/analytics";

export interface CompareToast {
  id: number;
  text: string;
  kind: "ok" | "error";
  /** Group to open from the toast's button; null = no button. */
  openGroup: string | null;
}

interface ToastState {
  toast: CompareToast | null;
  showToast: (text: string, kind?: "ok" | "error", openGroup?: string | null) => void;
  hideToast: () => void;
}

export const useCompareToast = create<ToastState>()((set) => ({
  toast: null,
  showToast: (text, kind = "ok", openGroup = null) => set((s) => ({ toast: { id: (s.toast?.id ?? 0) + 1, text, kind, openGroup } })),
  hideToast: () => set({ toast: null }),
}));

export const useCompare = createCompareStore({
  onOpen: (count) => {
    track("compare_open", undefined, JSON.stringify({ count }));
    useCompareToast.getState().hideToast();
  },
});

export function useCompareCount(): number {
  return useCompare((s) => s.entries.length);
}

export function useInCompare(id: string): boolean {
  return useCompare((s) => s.entries.some((e) => e.id === id));
}

/** Add/remove from a button + the toast that tells what happened. True = in the list afterwards. */
export function toggleCompare(id: string, group: string, t: LooseT): boolean {
  const { showToast } = useCompareToast.getState();
  return toggleCompareIn(
    useCompare,
    {
      removed: () => showToast(t("compare.removed")),
      // always with the button: a toast that grew a button on the second add changed size and jumped
      added: (n, group) => showToast(t("compare.added", { n }), "ok", group),
      groupFull: (n) => showToast(t("compare.groupFull", { n }), "error"),
      totalFull: (n) => showToast(t("compare.totalFull", { n }), "error"),
      track: (productId) => track("compare_add", undefined, JSON.stringify({ productId })),
    },
    id,
    group,
  );
}
