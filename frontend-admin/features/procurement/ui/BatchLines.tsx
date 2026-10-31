"use client";

import { Button } from "@shop/ui/admin-button";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Image } from "@/lib/image";
import { lineTitle } from "../model/batch";
import type { FormLine } from "../model/batch-form";

/** Позиции формы поставки: товар, сколько заказано, цена закупки (только главному админу). */
export function BatchLines({
  lines,
  locked,
  money,
  currency,
  onChange,
  onAdd,
}: {
  lines: FormLine[];
  locked: boolean;
  money: boolean;
  currency: string;
  onChange: (lines: FormLine[]) => void;
  onAdd: () => void;
}) {
  const patch = (key: string, p: Partial<FormLine>) => onChange(lines.map((x) => (x.key === key ? { ...x, ...p } : x)));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="field-label">Позиции</span>
        {!locked && (
          <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>
            Добавить товар
          </Button>
        )}
      </div>
      {locked && <p className="text-[12px] text-[var(--text-faint)]">Позиции можно менять, пока поставка не приехала.</p>}
      {lines.length === 0 && <p className="card-2 p-3 text-[13px] text-[var(--text-faint)]">Пока пусто.</p>}
      {lines.map((l) => (
        <div key={l.key} className="card-2 flex min-w-0 flex-wrap items-center gap-3 p-2">
          <Image src={l.imageUrl} alt={l.title} size={96} className="h-11 w-11 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)]" />
          <div className="min-w-0 flex-1 basis-44 text-[13.5px] font-semibold leading-snug text-[var(--text)]">
            <span className="line-clamp-2 break-words">{lineTitle(l.title, l.variantName)}</span>
          </div>
          <div className="w-24">
            <Input
              aria-label="Заказано, шт"
              inputMode="numeric"
              disabled={locked}
              value={l.qty}
              onChange={(e) => patch(l.key, { qty: e.target.value.replace(/[^\d]/g, "") })}
              rightSlot={<span className="text-[11px] text-[var(--text-faint)]">шт</span>}
            />
          </div>
          {money && (
            <div className="w-36">
              <Input
                aria-label={`Цена закупки за шт, ${currency}`}
                inputMode="decimal"
                disabled={locked}
                placeholder="цена"
                value={l.price}
                onChange={(e) => patch(l.key, { price: e.target.value })}
                rightSlot={<span className="text-[11px] text-[var(--text-faint)]">{currency}</span>}
              />
            </div>
          )}
          {!locked && (
            <button
              type="button"
              aria-label="Убрать позицию"
              onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
              className="grid h-9 w-9 place-items-center rounded-[var(--r-md)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--danger-ink)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
