"use client";

/**
 * Общие куски «Склада по партиям»: метка цвета партии, полоса состава склада с легендой и «уравнение» штуки
 * «закупка + доставка = себестоимость → маржа». Их делят быстрый просмотр товара и шаг «Цена и склад».
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { fxLine, lotMargin, lotName, type ShelfLot, pctText } from "../../model/lots";

const OLD = "#71717A";
/** Штриховка — штуки без закупки: видно, что цифра по ним неизвестна. */
const HATCH = `repeating-linear-gradient(135deg, ${OLD} 0 4px, #52525B 4px 8px)`;

export function lotFill(l: Pick<ShelfLot, "color" | "unitCostMinor">): string {
  return l.color ?? (l.unitCostMinor == null ? HATCH : OLD);
}

export function LotDot({ lot, className }: { lot: Pick<ShelfLot, "color" | "unitCostMinor">; className?: string }) {
  return <i aria-hidden className={cn("inline-block h-2.5 w-2.5 flex-none rounded-[3px]", className)} style={{ background: lotFill(lot) }} />;
}

/** Легенда: одна запись на поставку (у товара с вариантами у поставки бывает несколько партий). */
function legendOf(lots: ShelfLot[]) {
  const out = new Map<string, { lot: ShelfLot; label: string; qty: number }>();
  for (const l of lots) {
    const label = lotName(l);
    const key = `${label}|${l.color ?? ""}|${l.unitCostMinor == null}`;
    const cur = out.get(key);
    if (cur) cur.qty += l.qtyLeft;
    else out.set(key, { lot: l, label, qty: l.qtyLeft });
  }
  return [...out.values()];
}

export function StockBar({ lots, legend = true }: { lots: ShelfLot[]; legend?: boolean }) {
  const parts = legendOf(lots);
  const aria = `Состав склада: ${parts.map((p) => `${p.label} — ${p.qty} шт`).join(", ")}`;
  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={aria} className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-[var(--bg-2)]">
        {lots.map((l) => (
          <i key={l.id} className="block h-full" style={{ flex: l.qtyLeft, background: lotFill(l) }} />
        ))}
      </div>
      {legend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-[var(--text-muted)]">
          {parts.map((p) => (
            <span key={`${p.label}${p.lot.id}`} className="inline-flex items-center gap-1.5">
              <LotDot lot={p.lot} />
              {p.label} · <span className="tabular">{p.qty}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Подпись под закупкой: юани и курс у поставки, «вписано вручную» у старого остатка. */
export function purchaseNote(l: ShelfLot): string {
  if (l.kind === "BATCH") return fxLine(l) ?? "из поставки";
  return "вписано вручную";
}

export function deliveryNote(l: ShelfLot): string {
  if (l.kind !== "BATCH") return l.extraUnitMinor ? "вписано вручную" : "не указана";
  return l.preliminary ? "ещё вносится" : "по поставке";
}

function Cell({ k, v, d, tone }: { k: string; v: ReactNode; d?: ReactNode; tone?: "ok" | "bad" }) {
  return (
    <div className="min-w-0">
      <div className="font-display text-[10.5px] font-semibold uppercase tracking-[.06em] text-[var(--text-faint)]">{k}</div>
      <div
        className={cn(
          "tabular whitespace-nowrap font-display text-[14px] font-bold leading-[1.3] text-[var(--ink)]",
          tone === "ok" && "text-[var(--ok)]",
          tone === "bad" && "text-[var(--danger-ink)]"
        )}
      >
        {v}
      </div>
      {d && <div className="text-[11px] leading-[1.3] text-[var(--text-muted)]">{d}</div>}
    </div>
  );
}

const OP = "hidden pb-0.5 font-display text-[14px] font-semibold text-[var(--text-faint)] sm:block";

/** «Закупка + Доставка = Себест. → Маржа» одной полосой; на телефоне — 2 × 2 без знаков. */
export function LotEquation({ lot, priceMinor }: { lot: ShelfLot; priceMinor: number }) {
  const m = lotMargin(lot.unitCostMinor, priceMinor);
  return (
    <div
      className="grid grid-cols-2 items-end gap-x-1.5 gap-y-2.5 rounded-[var(--r-md)] bg-[var(--bg-2)] px-2.5 py-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.15fr)]"
    >
      <Cell k="Закупка" v={money(lot.purchaseUnitMinor)} d={purchaseNote(lot)} />
      <span className={OP}>+</span>
      <Cell k="Доставка" v={money(lot.extraUnitMinor ?? 0)} d={deliveryNote(lot)} />
      <span className={OP}>=</span>
      <Cell k="Себест." v={money(lot.unitCostMinor)} d="за 1 шт" />
      <span className={OP}>→</span>
      <Cell k="Маржа" v={m ? money(m.minor) : "—"} d={m ? `${pctText(m.pct)} от цены` : "нет цены"} tone={m && m.minor < 0 ? "bad" : "ok"} />
    </div>
  );
}

/** Подпись «N шт без закупки» — жёлтый чип. */
export function UnknownChip({ units }: { units: number }) {
  if (units <= 0) return null;
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-[var(--r-sm)] bg-[rgba(245,158,11,.12)] px-2 font-display text-[10.5px] font-bold uppercase tracking-[.07em] text-[#FBBF24]">
      {units} шт без закупки
    </span>
  );
}

export function NextChip() {
  return (
    <span className="inline-flex h-[20px] items-center whitespace-nowrap rounded-[var(--r-sm)] bg-[var(--accent-soft)] px-1.5 font-display text-[10px] font-bold uppercase tracking-[.07em] text-[var(--accent-hi)]">
      продаются первыми
    </span>
  );
}
