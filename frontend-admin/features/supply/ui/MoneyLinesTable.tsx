"use client";

import { Input } from "@/components/ui/Input";
import { pct } from "@/features/analytics";
import { lineTitle, type Allocation, type BatchMoneyLine } from "@/features/procurement";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { EMPTY_DRAFT, marginTone, type LineDraft } from "../model/money-form";

/** Таблица «Деньги» поставки: цена закупки, вес и доля расходов вводятся, остальное считает сервер. */
export function MoneyLinesTable({
  lines,
  drafts,
  allocation,
  currency,
  onChange,
}: {
  lines: BatchMoneyLine[];
  drafts: Record<number, LineDraft>;
  allocation: Allocation;
  currency: string;
  onChange: (itemId: number, patch: Partial<LineDraft>) => void;
}) {
  return (
    <div className="card thin-scroll overflow-x-auto p-0">
      <table className="data-table min-w-[980px]">
        <thead>
          <tr>
            <th>Товар</th>
            <th className="r">Шт</th>
            <th>Закупка, {currency}</th>
            {allocation === "BY_WEIGHT" && <th>Вес, г</th>}
            {allocation === "MANUAL" && <th>Доля расходов, ₴</th>}
            <th className="r">Закупка ₴/шт</th>
            <th className="r">Расходы ₴/шт</th>
            <th className="r">Себестоимость</th>
            <th className="r">Цена продажи</th>
            <th className="r">Маржа ₴</th>
            <th className="r">Маржа %</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const d = drafts[l.itemId] ?? EMPTY_DRAFT;
            return (
              <tr key={l.itemId}>
                <td>
                  <div className="flex min-w-[12rem] items-center gap-2.5">
                    <Image src={l.imageUrl} alt={l.title} size={80} className="h-9 w-9 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)]" />
                    <span className="line-clamp-2 break-words text-[13px] font-semibold">{lineTitle(l.title, l.variantName)}</span>
                  </div>
                </td>
                <td className="r" title={l.qtyArrived != null ? `заказано ${l.qtyOrdered}, приехало ${l.qtyArrived}` : undefined}>
                  {l.qty}
                </td>
                <td>
                  <Input
                    aria-label="Цена закупки"
                    inputMode="decimal"
                    value={d.price}
                    onChange={(e) => onChange(l.itemId, { price: e.target.value })}
                    placeholder="0.00"
                    className="w-24"
                  />
                </td>
                {allocation === "BY_WEIGHT" && (
                  <td>
                    <Input
                      aria-label="Вес, г"
                      inputMode="numeric"
                      value={d.weight}
                      onChange={(e) => onChange(l.itemId, { weight: e.target.value })}
                      placeholder="г"
                      className="w-20"
                    />
                  </td>
                )}
                {allocation === "MANUAL" && (
                  <td>
                    <Input
                      aria-label="Доля расходов, ₴"
                      inputMode="decimal"
                      value={d.manual}
                      onChange={(e) => onChange(l.itemId, { manual: e.target.value })}
                      placeholder="0.00"
                      className="w-24"
                    />
                  </td>
                )}
                <td className="r whitespace-nowrap">{l.purchaseUnitMinor != null ? money(l.purchaseUnitMinor) : "—"}</td>
                <td className="r whitespace-nowrap">{money(l.extraUnitMinor)}</td>
                <td className="r whitespace-nowrap font-semibold">{l.costUnitMinor != null ? money(l.costUnitMinor) : "—"}</td>
                <td className="r whitespace-nowrap">{money(l.priceMinor)}</td>
                <td className={cn("r whitespace-nowrap font-semibold", marginTone(l.marginPct))}>
                  {l.marginUnitMinor != null ? money(l.marginUnitMinor) : "—"}
                </td>
                <td className={cn("r whitespace-nowrap font-semibold", marginTone(l.marginPct))}>{pct(l.marginPct)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
