import { toPercent } from "@shop/core/percent";
import type { ProductCost } from "@/features/procurement";
import { pct } from "@/features/analytics";
import { money } from "@/lib/money";

/** «При этой цене: маржа 450 ₴ (31,2 %) к себестоимости …» — подсказка у поля цены; null, если считать не из чего. */
export function marginHint(cost: ProductCost | undefined, priceMinor: number): string | null {
  if (!cost || cost.currentCostMinor == null || priceMinor <= 0) return null;
  const m = priceMinor - cost.currentCostMinor;
  const p = toPercent(m / priceMinor);
  return `При этой цене: маржа ${money(m)} (${pct(p)}) к себестоимости ${money(cost.currentCostMinor)}${cost.currentPreliminary ? " (предварительной)" : ""}`;
}
