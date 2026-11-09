"use client";

import { Button } from "@shop/ui/admin-button";
import { ChevronDown, Pencil } from "lucide-react";
import { useState } from "react";
import { Toggle } from "@/components/ui/Toggle";
import { costUahMinor, fxToInput, lineTitle, type Batch } from "@/features/procurement";
import { ProductStateChips, useBatchProductTools, useBatchProducts } from "@/features/product";
import { BatchItemsTable, shortageOf } from "./BatchItemsTable";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";

const COLLAPSE_OVER = 8;
const COLLAPSED = 5;

/** Позиции поставки: заказано / пришло / ждут / остаток / цены, быстрый просмотр и правка товара. */
export function BatchItems({ batch, open }: { batch: Batch; open: boolean }) {
  const products = useBatchProducts(batch.items.map((i) => i.productId));
  const tools = useBatchProductTools();
  // Длинная поставка (20+ позиций) на телефоне — это метры прокрутки до «Кто ждёт»: показываем первые, остальное — по кнопке.
  const [all, setAll] = useState(batch.items.length <= COLLAPSE_OVER);
  const shown = all ? batch.items : batch.items.slice(0, COLLAPSED);
  return (
    <>
      <BatchItemsTable batch={batch} items={batch.items} open={open} products={products} tools={tools} />
      <div className="mb-5 flex min-w-0 flex-col gap-2 lg:hidden">
        {shown.map((i) => {
          const cost = batch.moneyVisible ? costUahMinor(i.unitPriceFx, batch.fxRate) : null;
          const enough = i.waitingQty <= i.qtyOrdered;
          const p = products.byId.get(i.productId);
          return (
            <div key={i.id} className="card flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <button
                type="button"
                disabled={!p}
                onClick={() => p && tools.openPreview(p)}
                title={p ? "Быстрый просмотр" : undefined}
                className="group flex min-w-0 flex-1 basis-52 items-center gap-3 text-left enabled:cursor-pointer"
              >
                <Image
                  src={i.imageUrl}
                  alt={i.title}
                  size={120}
                  className="h-12 w-12 shrink-0 rounded-[var(--r-md)] border border-[var(--line)] transition group-enabled:group-hover:border-[var(--accent)]"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="break-words text-[14px] font-semibold leading-snug text-[var(--text)] group-enabled:group-hover:text-[var(--accent-hi)]">
                    {lineTitle(i.title, i.variantName)}
                  </span>
                  <ProductStateChips p={p} loading={products.loading} />
                </span>
              </button>
              <div className="grid w-full grid-cols-3 gap-x-3 gap-y-2 sm:flex sm:w-auto sm:flex-wrap sm:gap-x-4">
                <Cell label="Заказано" value={`${i.qtyOrdered}`} />
                <Cell label="Пришло" value={i.qtyArrived != null ? `${i.qtyArrived}` : "—"} sub={shortageOf(i) > 0 ? `не хватило ${shortageOf(i)}` : undefined} warn={shortageOf(i) > 0} />
                <Cell
                  label={open && !enough ? "Ждут — не хватит" : "Ждут"}
                  value={i.waitingPeople ? `${i.waitingPeople} чел · ${i.waitingQty} шт` : "—"}
                  warn={open && !enough}
                  accent={i.waitingPeople > 0}
                />
                <Cell label="На складе всего" value={`${i.stock}`} />
                <Cell label="Продаём по" value={money(i.priceMinor)} />
                {batch.moneyVisible && (
                  <Cell
                    label="Закупка"
                    value={i.unitPriceFx != null ? `${fxToInput(i.unitPriceFx)} ${batch.currency ?? ""}` : "—"}
                    sub={cost != null ? `≈ ${money(cost)}/шт` : undefined}
                  />
                )}
              </div>
              {p && (
                <div className="flex items-center gap-3">
                  <Toggle checked={!!p.active} disabled={tools.busy === p.id} onChange={(v) => tools.setActive(p, v)} label="Показывать" />
                  <Button
                    variant="ghost"
                    size="icon"
                    icon={<Pencil className="h-4 w-4" />}
                    onClick={() => tools.openEditor(p)}
                    aria-label="Редактировать товар"
                    title="Редактировать товар"
                  />
                </div>
              )}
            </div>
          );
        })}
        {!all && (
          <Button variant="ghost" size="sm" className="self-start" icon={<ChevronDown className="h-4 w-4" />} onClick={() => setAll(true)}>
            Показать все {batch.items.length}
          </Button>
        )}
      </div>
      {tools.ui}
    </>
  );
}

function Cell({ label, value, sub, accent, warn }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="min-w-0 sm:min-w-[5.5rem]">
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
      <div
        className={
          "tabular font-display text-[14px] font-bold " + (warn ? "text-[var(--warn)]" : accent ? "text-[var(--accent-hi)]" : "text-[var(--ink)]")
        }
      >
        {value}
      </div>
      {sub && <div className="tabular text-[11px] text-[var(--text-faint)]">{sub}</div>}
    </div>
  );
}
