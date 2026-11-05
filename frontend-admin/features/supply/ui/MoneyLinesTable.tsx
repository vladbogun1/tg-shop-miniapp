"use client";

import { useMediaQuery } from "@shop/ui/use-media";
import { Input } from "@/components/ui/Input";
import { pct } from "@/features/analytics";
import { lineTitle, type Allocation, type BatchMoneyLine } from "@/features/procurement";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { EMPTY_DRAFT, marginTone, type LineDraft } from "../model/money-form";

interface Props {
  lines: BatchMoneyLine[];
  drafts: Record<number, LineDraft>;
  allocation: Allocation;
  currency: string;
  onChange: (itemId: number, patch: Partial<LineDraft>) => void;
}

/**
 * Закупка по товарам: цена закупки (и вес / ручная доля расходов) вводятся, остальное считает сервер.
 * На телефоне — карточка на товар: таблица в 10 колонок там не помещается.
 */
export function MoneyLinesTable(props: Props) {
  const phone = useMediaQuery("(max-width: 639px)", false);
  return phone ? <MoneyCards {...props} /> : <MoneyTable {...props} />;
}

type FieldProps = Pick<Props, "allocation" | "currency" | "onChange"> & {
  l: BatchMoneyLine;
  d: LineDraft;
  labels?: boolean;
};

/** Поля ввода строки — одни и те же в таблице (каждое в своей ячейке) и в карточке (с подписями). */
function PriceField({ l, d, currency, onChange, labels }: FieldProps) {
  const name = `Закупка 1 шт, ${currency}`;
  return (
    <Input
      id={`money-price-${l.itemId}`}
      label={labels ? name : undefined}
      aria-label={name}
      inputMode="decimal"
      value={d.price}
      onChange={(e) => onChange(l.itemId, { price: e.target.value })}
      placeholder="0.00"
      className={labels ? undefined : "w-24"}
    />
  );
}

/** Вес (при делении по весу) или ручная доля расходов (при ручном делении); иначе ничего. */
function ShareField({ l, d, allocation, onChange, labels }: FieldProps) {
  if (allocation === "BY_WEIGHT") {
    return (
      <Input
        id={`money-weight-${l.itemId}`}
        label={labels ? "Вес 1 шт, г" : undefined}
        aria-label="Вес 1 шт, г"
        inputMode="numeric"
        value={d.weight}
        onChange={(e) => onChange(l.itemId, { weight: e.target.value })}
        placeholder="г"
        className={labels ? undefined : "w-20"}
      />
    );
  }
  if (allocation !== "MANUAL") return null;
  return (
    <Input
      id={`money-manual-${l.itemId}`}
      label={labels ? "Доля расходов, ₴" : undefined}
      aria-label="Доля расходов, ₴"
      inputMode="decimal"
      value={d.manual}
      onChange={(e) => onChange(l.itemId, { manual: e.target.value })}
      placeholder="0.00"
      className={labels ? undefined : "w-24"}
    />
  );
}

function MoneyCards({ lines, drafts, ...rest }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {lines.map((l) => (
        <div key={l.itemId} className="card-2 flex min-w-0 flex-col gap-2.5 p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Image src={l.imageUrl} alt={l.title} size={80} className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)]" />
            <div className="min-w-0">
              <div className="break-words text-[14px] font-semibold text-[var(--text)]">{lineTitle(l.title, l.variantName)}</div>
              <div className="tabular text-[12px] text-[var(--text-muted)]">{l.qty} шт</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PriceField l={l} d={drafts[l.itemId] ?? EMPTY_DRAFT} labels {...rest} />
            <ShareField l={l} d={drafts[l.itemId] ?? EMPTY_DRAFT} labels {...rest} />
          </div>
          <div className="tabular grid grid-cols-3 gap-2 text-[12px] text-[var(--text-muted)]">
            <div>
              <div>Обошлась 1 шт</div>
              <div className="font-display text-[14px] font-bold text-[var(--ink)]">{l.costUnitMinor != null ? money(l.costUnitMinor) : "—"}</div>
            </div>
            <div>
              <div>Продаём по</div>
              <div className="font-display text-[14px] font-bold text-[var(--ink)]">{money(l.priceMinor)}</div>
            </div>
            <div>
              <div>Прибыль с 1 шт</div>
              <div className={cn("font-display text-[14px] font-bold", marginTone(l.marginPct))}>
                {l.marginUnitMinor != null ? `${money(l.marginUnitMinor)} · ${pct(l.marginPct)}` : "—"}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MoneyTable({ lines, drafts, allocation, currency, onChange }: Props) {
  return (
    <div className="card thin-scroll overflow-x-auto p-0">
      <table className="data-table min-w-[900px]">
        <thead>
          <tr>
            <th>Товар</th>
            <th className="r">Шт</th>
            <th>Закупка 1 шт, {currency}</th>
            {allocation === "BY_WEIGHT" && <th>Вес 1 шт, г</th>}
            {allocation === "MANUAL" && <th>Доля расходов, ₴</th>}
            <th className="r">Закупка ₴/шт</th>
            <th className="r">Доставка и пр. ₴/шт</th>
            <th className="r">Обошлась 1 шт</th>
            <th className="r">Продаём по</th>
            <th className="r">Прибыль с 1 шт</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.itemId}>
              <td>
                <div className="flex min-w-[12rem] items-center gap-2.5">
                  <Image src={l.imageUrl} alt={l.title} size={80} className="h-9 w-9 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)]" />
                  <span className="break-words text-[13px] font-semibold">{lineTitle(l.title, l.variantName)}</span>
                </div>
              </td>
              <td className="r" title={l.qtyArrived != null ? `заказано ${l.qtyOrdered}, приехало ${l.qtyArrived}` : undefined}>
                {l.qty}
              </td>
              <td>
                <PriceField l={l} d={drafts[l.itemId] ?? EMPTY_DRAFT} allocation={allocation} currency={currency} onChange={onChange} />
              </td>
              {(allocation === "BY_WEIGHT" || allocation === "MANUAL") && (
                <td>
                  <ShareField l={l} d={drafts[l.itemId] ?? EMPTY_DRAFT} allocation={allocation} currency={currency} onChange={onChange} />
                </td>
              )}
              <td className="r whitespace-nowrap">{l.purchaseUnitMinor != null ? money(l.purchaseUnitMinor) : "—"}</td>
              <td className="r whitespace-nowrap">{money(l.extraUnitMinor)}</td>
              <td className="r whitespace-nowrap font-semibold">{l.costUnitMinor != null ? money(l.costUnitMinor) : "—"}</td>
              <td className="r whitespace-nowrap">{money(l.priceMinor)}</td>
              <td className={cn("r whitespace-nowrap font-semibold", marginTone(l.marginPct))}>
                {l.marginUnitMinor != null ? `${money(l.marginUnitMinor)} · ${pct(l.marginPct)}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
