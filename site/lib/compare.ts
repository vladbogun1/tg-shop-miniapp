"use client";

/**
 * Comparison list of the website — the shared store of `@shop/customer/compare` (ids in localStorage `compare-v1`);
 * its `open` state lets a card, the product page and the header all open the modal.
 *
 * Several tabs: a `storage` event re-reads the list, so adding in one tab updates the badge in the others.
 */
import { useEffect } from "react";
import { COMPARE_STORAGE_KEY } from "@shop/core/compare";
import { createCompareStore } from "@shop/customer/compare/store";
import { toggleCompareIn } from "@shop/customer/compare/toggle";
import { toast } from "@shop/ui/toast";
import type { TFunction } from "@/i18n";
import { trackCompare } from "./analytics";

export const useCompare = createCompareStore();

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
  return toggleCompareIn(
    useCompare,
    {
      removed: () => toast.success(t("compare.removed")),
      // always with the button: a toast that grew a button on the second add changed size and jumped
      added: (n, group) => toast.success(t("compare.added", { n }), { action: { label: t("compare.open"), onClick: () => useCompare.getState().openScreen(group) } }),
      groupFull: (n) => toast.error(t("compare.groupFull", { n })),
      totalFull: (n) => toast.error(t("compare.totalFull", { n })),
      track: (productId) => trackCompare("compare_add", productId),
    },
    id,
    group,
  );
}
