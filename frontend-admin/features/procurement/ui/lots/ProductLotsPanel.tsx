"use client";

/**
 * Быстрый просмотр товара → «Себестоимость и маржа»: итог по складу (средняя себестоимость, маржа, прибыль,
 * если продать всё) и каждая партия своей строкой в порядке продажи — «закупка + доставка = себестоимость → маржа».
 * Только при праве «Финансы»: без него блок не рендерится.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { useProductCost } from "../../queries";
import { dayOf, lotName, shelfLots, stockSummary, type ShelfLot, pctText } from "../../model/lots";
import { LotDot, LotEquation, NextChip, StockBar, UnknownChip } from "./parts";

function Kpi({ k, v, s, ok }: { k: ReactNode; v: string; s?: string; ok?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11.5px] leading-[1.3] text-[var(--text-faint)]">{k}</div>
      <div className={cn("tabular mt-0.5 font-display text-[19px] font-extrabold leading-[1.25]", ok ? "text-[var(--ok)]" : "text-[var(--ink)]")}>{v}</div>
      {s && <div className="tabular text-[11.5px] text-[var(--text-muted)]">{s}</div>}
    </div>
  );
}

function LotSub({ l }: { l: ShelfLot }) {
  if (l.kind !== "BATCH") {
    const what = l.kind === "OPENING" ? "был до учёта поставок" : "добавлены руками в карточке";
    return <div className="text-[12px] text-[var(--text-faint)]">{l.unitCostMinor == null ? what : `${what} · закупка вписана`}</div>;
  }
  return (
    <div className="text-[12px] text-[var(--text-faint)]">
      {[l.batchTitle, l.arrivedAt ? `приехала ${dayOf(l.arrivedAt)}` : null].filter(Boolean).join(" · ")}
      {l.unitCostMinor != null && (
        <span className={l.preliminary ? "text-[#FBBF24]" : "text-[#4ADE80]"}> · {l.preliminary ? "расходы ещё вносятся" : "расходы внесены"}</span>
      )}
    </div>
  );
}

function soldNote(l: ShelfLot): string {
  const sold = l.qtyIn - l.qtyLeft;
  return sold > 0 ? `${sold} продано` : "ещё не продавались";
}

function LotRow({ l, priceMinor, onPriceOld }: { l: ShelfLot; priceMinor: number; onPriceOld?: () => void }) {
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--line)] px-3.5 py-3 first:border-t-0">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-start gap-2">
          <LotDot lot={l} className="mt-[5px]" />
          <div className="min-w-0">
            <div className="break-words text-[13.5px] font-semibold text-[var(--ink)]">
              {l.kind === "BATCH" && l.batchId != null ? (
                <Link href={`/preorders/${l.batchId}`} className="text-[var(--accent-hi)] hover:underline">
                  {lotName(l)}
                </Link>
              ) : (
                lotName(l)
              )}
              {l.variantName && <span className="font-normal text-[var(--text-faint)]"> · {l.variantName}</span>}
            </div>
            <LotSub l={l} />
          </div>
        </div>
        <div className="tabular whitespace-nowrap text-right font-display text-[13px] font-bold text-[var(--text)]">
          {l.qtyLeft} из {l.qtyIn} шт
          <div className="mt-0.5 font-body text-[11px] font-medium text-[var(--text-faint)]">{l.next ? <NextChip /> : soldNote(l)}</div>
        </div>
      </div>
      {l.unitCostMinor != null ? (
        <LotEquation lot={l} priceMinor={priceMinor} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[var(--r-md)] bg-[rgba(245,158,11,.12)] px-2.5 py-2 text-[12.5px] text-[#FCD34D]">
          <span>Закупка не указана — маржу по этим {l.qtyLeft} шт не посчитать.</span>
          {onPriceOld && (
            <button type="button" onClick={onPriceOld} className="font-semibold text-[var(--accent-hi)] hover:underline">
              Указать закупку →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ProductLotsPanel({ productId, onPriceOld }: { productId: string; onPriceOld?: () => void }) {
  const cost = useProductCost(productId);
  if (!cost) return null;
  const lots = shelfLots(cost.lots);
  if (!lots.length) return null;
  const s = stockSummary(lots, cost.priceMinor);
  const mismatch = cost.onLots !== cost.stock;
  return (
    <section aria-label="Себестоимость и маржа" className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-2)]">
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 pt-3">
        <h4 className="field-label">Себестоимость и маржа</h4>
        <UnknownChip units={s.unknownUnits} />
      </div>
      <div className="grid grid-cols-2 gap-3 px-3.5 pb-3.5 pt-2.5 sm:grid-cols-3">
        <Kpi
          k="Средняя себестоимость"
          v={s.avgCostMinor != null ? money(s.avgCostMinor) : "—"}
          s={s.knownUnits ? `по ${s.knownUnits} шт с известной закупкой` : "закупка не указана"}
        />
        <Kpi
          k={
            <>
              Средняя маржа при <span className="whitespace-nowrap">{money(cost.priceMinor)}</span>
            </>
          }
          v={s.avgMarginMinor != null ? money(s.avgMarginMinor) : "—"}
          s={s.marginPct != null ? `${pctText(s.marginPct)} · наценка ${pctText(s.markupPct)}` : undefined}
          ok={(s.avgMarginMinor ?? 0) > 0}
        />
        <Kpi
          k="Прибыль, если продать всё"
          v={s.profitMinor != null ? money(s.profitMinor) : "—"}
          s={s.unknownUnits ? `+ ${s.unknownUnits} шт без закупки` : undefined}
        />
      </div>
      <div className="px-3.5 pb-3">
        <StockBar lots={lots} />
      </div>
      <div className="border-t border-[var(--line)]">
        {lots.map((l) => (
          <LotRow key={l.id} l={l} priceMinor={cost.priceMinor} onPriceOld={onPriceOld} />
        ))}
      </div>
      {mismatch && (
        <p className="border-t border-[var(--line)] px-3.5 py-2 text-[12px] text-[var(--warn)]">
          На партиях {cost.onLots} шт, на складе {cost.stock} шт — расходятся. Выровнять: Метрики → Маржа → «Начальная себестоимость».
        </p>
      )}
    </section>
  );
}
