"use client";

import { Input } from "@/components/ui/Input";
import { pct } from "@/features/analytics";
import { costUahMinor, lineTitle, type ArriveLineResult, type Batch } from "@/features/procurement";
import { money, toMinor } from "@/lib/money";
import { marginPercent } from "../model/format";

export interface ArriveRow {
  qty: string;
  price: string;
}

/** Одна позиция окна «Приехала»: сколько пришло, цена продажи, себестоимость и маржа, результат расчёта. */
export function ArriveLine({
  batch,
  item: i,
  row: r,
  res,
  unitCost,
  onEdit,
}: {
  batch: Batch;
  item: Batch["items"][number];
  row: ArriveRow;
  res: ArriveLineResult | undefined;
  unitCost: number | null;
  onEdit: (patch: Partial<ArriveRow>) => void;
}) {
  const priceNow = toMinor(r.price.replace(",", "."));
  const marginPct = unitCost != null && priceNow > 0 ? marginPercent(priceNow, unitCost) : null;
  const cost = batch.moneyVisible ? costUahMinor(i.unitPriceFx, batch.fxRate) : null;
  return (
    <div key={i.id} className="card-2 flex min-w-0 flex-col gap-2 p-3">
      <div className="flex min-w-0 flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-52">
          <div className="line-clamp-2 break-words text-[14px] font-semibold text-[var(--text)]">{lineTitle(i.title, i.variantName)}</div>
          <div className="tabular text-[12px] text-[var(--text-faint)]">
            заказано {i.qtyOrdered} · сейчас на складе {i.stock} · ждут {i.waitingPeople} чел / {i.waitingQty} шт · цена {money(i.priceMinor)}
            {cost != null && ` · закупка ≈ ${money(cost)}/шт`}
          </div>
        </div>
        <div className="w-24">
          <Input label="Пришло, шт" inputMode="numeric" value={r.qty} onChange={(e) => onEdit({ qty: e.target.value.replace(/[^\d]/g, "") })} />
        </div>
        <div className="w-32">
          <Input label="Цена продажи, ₴" inputMode="decimal" value={r.price} onChange={(e) => onEdit({ price: e.target.value })} />
          {unitCost != null && (
            <div className="tabular mt-1 text-[11.5px] leading-snug text-[var(--text-faint)]">
              себестоимость {money(unitCost)}
              {marginPct != null && (
                <>
                  {" · маржа "}
                  <b className={marginPct < 10 ? "text-[var(--danger-ink)]" : "text-[var(--ok)]"}>{pct(marginPct)}</b>
                </>
              )}
            </div>
          )}
        </div>
      </div>
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
          <span className={res.shortPeople > 0 ? "text-[var(--warn)]" : "text-[var(--text-muted)]"}>не хватит {res.shortPeople} чел</span>
          <span className="text-[var(--text-muted)]">свободно в продажу {res.freeAfter} шт</span>
          <span className="text-[var(--text-faint)]">остаток после: {res.stockAfter}</span>
        </div>
      )}
    </div>
  );
}
