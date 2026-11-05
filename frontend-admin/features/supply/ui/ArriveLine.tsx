"use client";

import { Input } from "@/components/ui/Input";
import { pct } from "@/features/analytics";
import { lineTitle, type ArriveLineResult, type Batch } from "@/features/procurement";
import { money, toMinor } from "@/lib/money";
import { arrivedUnitCost, marginPercent } from "../model/format";

export interface ArriveRow {
  qty: string;
  price: string;
}

/** Закупка и расходы строки из «Денег» — чтобы оценить, сколько обойдётся 1 шт при том, сколько реально пришло. */
export interface LineCost {
  purchaseUnitMinor: number | null;
  extraLineMinor: number;
}

/** Одна позиция окна «Приехала»: сколько пришло, цена продажи, сколько обойдётся 1 шт и прибыль с неё, результат проверки. */
export function ArriveLine({
  item: i,
  row: r,
  res,
  cost,
  onEdit,
}: {
  item: Batch["items"][number];
  row: ArriveRow;
  res: ArriveLineResult | undefined;
  cost: LineCost | null;
  onEdit: (patch: Partial<ArriveRow>) => void;
}) {
  const qty = Number(r.qty) || 0;
  const priceNow = toMinor(r.price.replace(",", "."));
  const unit = cost ? arrivedUnitCost(cost.purchaseUnitMinor, cost.extraLineMinor, qty) : null;
  const marginPct = unit != null && priceNow > 0 ? marginPercent(priceNow, unit) : null;
  const short = qty < i.qtyOrdered;
  return (
    <div className="card-2 flex min-w-0 flex-col gap-2 p-3">
      <div className="flex min-w-0 flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-52">
          <div className="break-words text-[14px] font-semibold text-[var(--text)]">{lineTitle(i.title, i.variantName)}</div>
          <div className="tabular text-[12px] text-[var(--text-muted)]">
            заказали {i.qtyOrdered} шт · на складе сейчас {i.stock}
            {i.waitingPeople > 0 && ` · ждут ${i.waitingPeople} чел.`}
          </div>
        </div>
        <div className="w-24">
          <Input
            id={`arrive-qty-${i.id}`}
            label="Пришло, шт"
            inputMode="numeric"
            value={r.qty}
            onChange={(e) => onEdit({ qty: e.target.value.replace(/[^\d]/g, "") })}
          />
        </div>
        <div className="w-32">
          <Input id={`arrive-price-${i.id}`} label="Продаём по, ₴" inputMode="decimal" value={r.price} onChange={(e) => onEdit({ price: e.target.value })} />
        </div>
      </div>
      {unit != null && (
        <div className="tabular text-[12.5px] text-[var(--text-muted)]">
          1 шт обойдётся ≈ {money(unit)}
          {marginPct != null && (
            <>
              {" · прибыль с продажи "}
              <b className={marginPct < 10 ? "text-[var(--danger-ink)]" : "text-[var(--ok)]"}>{pct(marginPct)}</b>
            </>
          )}
          {short && qty > 0 && " · пришло меньше — доставка делится на меньше штук"}
        </div>
      )}
      {res && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--r-sm)] bg-[var(--surface-3)] px-2.5 py-1.5 text-[13px]">
          <span className="text-[var(--text)]">
            бронь получат <b>{res.heldPeople}</b> чел ({res.heldQty} шт)
          </span>
          {res.notifiedPeople > 0 && (
            <span className="text-[var(--text)]">
              сообщение получат <b>{res.notifiedPeople}</b> чел
            </span>
          )}
          {res.shortPeople > 0 && <span className="text-[var(--warn)]">не хватит {res.shortPeople} чел</span>}
          <span className="text-[var(--text-muted)]">в свободную продажу {res.freeAfter} шт</span>
          <span className="text-[var(--text-muted)]">на складе станет {res.stockAfter}</span>
        </div>
      )}
    </div>
  );
}
