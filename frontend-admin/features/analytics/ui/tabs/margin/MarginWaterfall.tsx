import { BarChart3 } from "lucide-react";
import { uah, uahExact } from "../../../model/format";
import { waterfallBars, type BarTone } from "../../../model/margin";
import type { MarginReport } from "../../../model/types";
import { Panel } from "../../kit";

const TONE_COLOR: Record<BarTone, string> = {
  base: "var(--mx-s2)",
  minus: "var(--mx-down)",
  profit: "var(--mx-up)",
  loss: "var(--mx-down)",
};

/**
 * «Откуда прибыль»: выручка с известной себестоимостью → − себестоимость → − комиссии → прибыль.
 * Та же формула, что у плитки «Прибыль»; выручка без себестоимости — серой строкой вне формулы.
 */
export function MarginWaterfall({ r }: { r: MarginReport }) {
  const bars = waterfallBars(r);
  const noCost = Math.max(0, r.revenueMinor - r.knownRevenueMinor);
  return (
    <Panel
      title="Откуда прибыль"
      icon={BarChart3}
      hint="Выручка с известной себестоимостью − себестоимость − комиссии = прибыль. Скидки уже учтены в выручке, подарки — в себестоимости."
    >
      <div className="flex flex-col gap-3">
        {bars.map((b) => (
          <div key={b.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <div className="min-w-0 text-[13px] font-semibold text-[var(--text)]">
              {b.label}
              {b.key === "cost" && b.note && (
                <span className="ml-1.5 text-[11px] font-normal text-[var(--text-faint)]">
                  {b.note}: {uah(r.giftsCostMinor)}
                </span>
              )}
            </div>
            <div className="font-display text-right font-bold mx-num" style={{ color: b.key === "profit" ? TONE_COLOR[b.tone] : "var(--text)" }}>
              {b.key === "fee" ? `−${uahExact(r.feeMinor)}` : b.valueMinor < 0 ? `−${uah(-b.valueMinor)}` : uah(b.valueMinor)}
            </div>
            <div className="relative col-span-2 h-3 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden>
              <div
                className="absolute inset-y-0 rounded-full"
                style={{ left: `${b.leftPct}%`, width: `${Math.max(b.widthPct, b.valueMinor === 0 ? 0 : 0.8)}%`, background: TONE_COLOR[b.tone] }}
              />
            </div>
          </div>
        ))}
        {noCost > 0 && (
          <div className="flex items-start justify-between gap-3 border-t border-[var(--line)] pt-2 text-[12.5px] text-[var(--text-muted)]">
            <span>Без себестоимости (вне формулы, в прибыль не входит)</span>
            <b className="shrink-0 text-[var(--text-muted)] mx-num">{uah(noCost)}</b>
          </div>
        )}
      </div>
    </Panel>
  );
}
