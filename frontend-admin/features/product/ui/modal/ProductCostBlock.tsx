"use client";

/**
 * Карточка товара → «Себестоимость»: по какой цене уйдёт следующая штука (FIFO), маржа при текущей цене,
 * партии с остатком и сверка с остатком на складе. Рендерится только при праве «Финансы».
 */
import { QUERY_PRESETS } from "@shop/core/query";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LOT_KIND_LABEL, costingApi, procurementKeys, useFinanceAccess, type Lot, type ProductCost } from "@/features/procurement";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { pct } from "@/features/analytics";
import { toPercent } from "@shop/core/percent";
import { Badge } from "@/components/ui/Badge";

/** Себестоимость товара; undefined — нет права «Финансы», не загружено или не нужно (новый товар). */
export function useProductCost(productId: string | null | undefined, enabled = true): ProductCost | undefined {
  const finance = useFinanceAccess();
  const q = useQuery({
    queryKey: procurementKeys.product(productId as string),
    queryFn: () => costingApi.product(productId as string),
    enabled: finance && enabled && !!productId,
    staleTime: QUERY_PRESETS.list.staleTime,
    retry: false,
  });
  return finance ? q.data : undefined;
}

/** «Маржа при этой цене: 450 ₴ (31,2 %)» — для подсказки у поля цены; null, если считать не из чего. */
export function marginHint(cost: ProductCost | undefined, priceMinor: number): string | null {
  if (!cost || cost.currentCostMinor == null || priceMinor <= 0) return null;
  const m = priceMinor - cost.currentCostMinor;
  const p = toPercent(m / priceMinor);
  return `При этой цене: маржа ${money(m)} (${pct(p)}) к себестоимости ${money(cost.currentCostMinor)}${cost.currentPreliminary ? " (предварительной)" : ""}`;
}

function lotLabel(l: Lot): string {
  if (l.kind === "BATCH") return l.batchTitle ?? LOT_KIND_LABEL.BATCH;
  return LOT_KIND_LABEL[l.kind] ?? l.kind;
}

export function ProductCostBlock({ productId }: { productId: string }) {
  const cost = useProductCost(productId);
  if (!cost) return null;
  const lots = cost.lots.filter((l) => l.qtyLeft > 0);
  const mismatch = cost.onLots !== cost.stock;
  return (
    <section className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <h4 className="field-label mb-2">Себестоимость</h4>
      {cost.currentCostMinor == null ? (
        <p className="text-[13px] text-[var(--text-muted)]">Нет данных: себестоимость не внесена. Для старого остатка — «Начальная себестоимость» в Метриках → Маржа.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <div className="text-[11px] text-[var(--text-faint)]">Следующая штука продаётся по</div>
            <div className="tabular font-display text-[18px] font-bold text-[var(--ink)]">{money(cost.currentCostMinor)}</div>
            {cost.currentPreliminary ? <Badge tone="warn">предварительная</Badge> : <Badge tone="ok">окончательная</Badge>}
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-faint)]">Маржа при цене {money(cost.priceMinor)}</div>
            <div className={cn("tabular font-display text-[18px] font-bold", (cost.marginMinor ?? 0) < 0 ? "text-[#F87171]" : "text-[var(--ok)]")}>
              {cost.marginMinor != null ? money(cost.marginMinor) : "—"} · {pct(cost.marginPct)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--text-faint)]">Наценка</div>
            <div className="tabular font-display text-[18px] font-bold text-[var(--ink)]">{pct(cost.markupPct)}</div>
          </div>
        </div>
      )}

      {lots.length > 0 && (
        <div className="mt-3 flex flex-col divide-y divide-[var(--line)] text-[13px]">
          {lots.map((l) => (
            <div key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 first:pt-0 last:pb-0">
              <span className="min-w-0 break-words text-[var(--text)]">
                {l.kind === "BATCH" && l.batchId != null ? (
                  <Link href={`/preorders/${l.batchId}`} className="text-[var(--accent-hi)] hover:underline">
                    {lotLabel(l)}
                  </Link>
                ) : (
                  lotLabel(l)
                )}
                {l.variantName ? <span className="text-[var(--text-faint)]"> · {l.variantName}</span> : null}
                {l.preliminary && <span className="text-[var(--warn)]"> · предв.</span>}
              </span>
              <span className="tabular text-[var(--text-muted)]">
                {l.qtyLeft} из {l.qtyIn} шт · {l.unitCostMinor != null ? money(l.unitCostMinor) : "нет данных"}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className={cn("mt-2 text-[12px]", mismatch ? "text-[var(--warn)]" : "text-[var(--text-faint)]")}>
        На партиях {cost.onLots} шт, на складе {cost.stock} шт{mismatch ? " — расходятся, нажмите «Выровнять партии со складом» в «Начальной себестоимости»" : ""}.
      </p>
    </section>
  );
}
