"use client";

import { Button } from "@shop/ui/admin-button";
import { Pencil } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { costUahMinor, fxToInput, lineTitle, type Batch } from "@/features/procurement";
import { ProductStateChips, type useBatchProductTools, type useBatchProducts } from "@/features/product";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";

type Products = ReturnType<typeof useBatchProducts>;
type Tools = ReturnType<typeof useBatchProductTools>;

/** «Не хватило N» у приехавшей позиции: пришло меньше, чем ждали покупатели. */
export function shortageOf(i: Batch["items"][number]): number {
  return i.qtyArrived != null && i.waitingQty > i.qtyArrived ? i.waitingQty - i.qtyArrived : 0;
}

/**
 * Позиции поставки таблицей (ноутбук, вариант A): заказано / пришло / ждут / на складе / цена продажи / закупка,
 * быстрый просмотр и правка товара. Закупка — только с правом «Финансы» (`batch.moneyVisible`).
 */
export function BatchItemsTable({ batch, items, open, products, tools }: { batch: Batch; items: Batch["items"]; open: boolean; products: Products; tools: Tools }) {
  const money$ = batch.moneyVisible;
  const th = "px-3 py-2 text-[11.5px] font-semibold text-[var(--text-faint)]";
  return (
    <div className="panel hidden min-w-0 overflow-x-auto lg:block">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--line)] text-left">
            <th className={th}>Товар</th>
            <th className={cn(th, "text-right")}>Заказано</th>
            <th className={cn(th, "text-right")}>Пришло</th>
            <th className={th}>Ждут</th>
            <th className={cn(th, "text-right")}>На складе</th>
            <th className={cn(th, "text-right")}>Продаём по</th>
            {money$ && <th className={cn(th, "text-right")}>Закупка</th>}
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <ItemRow key={i.id} batch={batch} i={i} open={open} products={products} tools={tools} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemRow({ batch, i, open, products, tools }: { batch: Batch; i: Batch["items"][number]; open: boolean; products: Products; tools: Tools }) {
  const money$ = batch.moneyVisible;
  const p = products.byId.get(i.productId);
  const enough = i.waitingQty <= i.qtyOrdered;
  const short = shortageOf(i);
  return (
        <tr className="border-b border-[var(--line)] align-middle last:border-0">
          <td className="max-w-[22rem] px-3 py-2">
            <button
              type="button"
              disabled={!p}
              onClick={() => p && tools.openPreview(p)}
              title={p ? "Быстрый просмотр" : undefined}
              className="group flex min-w-0 items-center gap-3 text-left enabled:cursor-pointer"
            >
              <Image
                src={i.imageUrl}
                alt={i.title}
                size={96}
                className="h-10 w-10 shrink-0 rounded-[var(--r-md)] border border-[var(--line)] transition group-enabled:group-hover:border-[var(--accent)]"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="break-words font-semibold leading-snug text-[var(--text)] group-enabled:group-hover:text-[var(--accent-hi)]">
                  {lineTitle(i.title, i.variantName)}
                </span>
                <ProductStateChips p={p} loading={products.loading} />
              </span>
            </button>
          </td>
          <td className="tabular px-3 py-2 text-right">{i.qtyOrdered}</td>
          <td className="tabular px-3 py-2 text-right">
            {i.qtyArrived != null ? i.qtyArrived : "—"}
            {short > 0 && <div className="text-[11.5px] text-[var(--warn)]">не хватило {short}</div>}
          </td>
          <td className={cn("tabular px-3 py-2", open && !enough ? "text-[var(--warn)]" : i.waitingPeople > 0 && "text-[var(--accent-hi)]")}>
            {i.waitingPeople ? `${i.waitingPeople} чел · ${i.waitingQty} шт` : "—"}
            {open && !enough && <div className="text-[11.5px]">не хватит</div>}
          </td>
          <td className="tabular px-3 py-2 text-right">{i.stock}</td>
          <td className="tabular whitespace-nowrap px-3 py-2 text-right">{money(i.priceMinor)}</td>
          {money$ && <CostCell batch={batch} i={i} />}
          <td className="px-3 py-2">{p && <ProductActions p={p} tools={tools} />}</td>
        </tr>
  );
}

function CostCell({ batch, i }: { batch: Batch; i: Batch["items"][number] }) {
  const cost = costUahMinor(i.unitPriceFx, batch.fxRate);
  return (
    <td className="tabular whitespace-nowrap px-3 py-2 text-right">
      {i.unitPriceFx != null ? `${fxToInput(i.unitPriceFx)} ${batch.currency ?? ""}` : "—"}
      {cost != null && <div className="text-[11.5px] text-[var(--text-faint)]">≈ {money(cost)}/шт</div>}
    </td>
  );
}

function ProductActions({ p, tools }: { p: NonNullable<ReturnType<Products["byId"]["get"]>>; tools: Tools }) {
  return (
    <div className="flex items-center justify-end gap-2">
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
  );
}
