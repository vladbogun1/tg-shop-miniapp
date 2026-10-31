"use client";

import { Button } from "@shop/ui/admin-button";
import { Pencil } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { costUahMinor, fxToInput, lineTitle, type Batch } from "@/features/procurement";
import { ProductStateChips, useBatchProductTools, useBatchProducts } from "@/features/product";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";

/** Позиции поставки: заказано / пришло / ждут / остаток / цены, быстрый просмотр и правка товара. */
export function BatchItems({ batch, open }: { batch: Batch; open: boolean }) {
  const products = useBatchProducts(batch.items.map((i) => i.productId));
  const tools = useBatchProductTools();
  return (
    <>
      <div className="mb-5 flex min-w-0 flex-col gap-2">
        {batch.items.map((i) => {
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
                  <span className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-[var(--text)] group-enabled:group-hover:text-[var(--accent-hi)]">
                    {lineTitle(i.title, i.variantName)}
                  </span>
                  <ProductStateChips p={p} loading={products.loading} />
                </span>
              </button>
              <Cell label="Заказано" value={`${i.qtyOrdered}`} />
              <Cell label="Пришло" value={i.qtyArrived != null ? `${i.qtyArrived}` : "—"} />
              <Cell label="Ждут" value={`${i.waitingPeople} чел / ${i.waitingQty} шт`} warn={open && !enough} accent={i.waitingPeople > 0} />
              <Cell label="На складе" value={`${i.stock}`} />
              <Cell label="Цена продажи" value={money(i.priceMinor)} />
              {batch.moneyVisible && (
                <Cell
                  label="Закупка"
                  value={i.unitPriceFx != null ? `${fxToInput(i.unitPriceFx)} ${batch.currency ?? ""}` : "—"}
                  sub={cost != null ? `≈ ${money(cost)}/шт` : undefined}
                />
              )}
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
      </div>
      {tools.ui}
    </>
  );
}

function Cell({ label, value, sub, accent, warn }: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="min-w-[5.5rem]">
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
