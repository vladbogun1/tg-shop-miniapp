"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { qtyOf, type OrderLine } from "../../model/new-order";

const STEP_BTN = "hit flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] hover:bg-[var(--surface-3)]";

interface Props {
  line: OrderLine;
  onQty: (key: string, text: string) => void;
  onRemove: (key: string) => void;
}

/** Строка товара ручного заказа: фото, цена × количество, шаги ±, убрать. */
export function LineRow({ line: l, onQty, onRemove }: Props) {
  return (
    <div className="card-2 flex items-center gap-2.5 p-2">
      <Image
        src={l.product.images?.[0]?.url}
        alt={l.product.title}
        size={96}
        className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
      />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 break-words text-[13.5px] leading-snug font-semibold text-[var(--text)]">
          {l.product.title}
          {l.variant && <span className="text-[var(--text-muted)]"> · {l.variant.name}</span>}
        </div>
        <div className="tabular text-[12px] text-[var(--text-faint)]">
          {money(l.product.priceMinor, l.product.currency)} × {qtyOf(l)} = {money(l.product.priceMinor * qtyOf(l), l.product.currency)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="Меньше"
          className={`${STEP_BTN} text-[var(--text-muted)]`}
          onClick={() => onQty(l.key, String(Math.max(1, qtyOf(l) - 1)))}
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          inputMode="numeric"
          aria-label="Количество"
          value={l.qtyText}
          onChange={(e) => onQty(l.key, e.target.value)}
          onBlur={() => qtyOf(l) < 1 && onQty(l.key, "1")}
          className="tabular h-8 w-10 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] text-center text-[13px] text-[var(--text)]"
        />
        <button
          type="button"
          aria-label="Больше"
          className={`${STEP_BTN} text-[var(--text-muted)]`}
          onClick={() => onQty(l.key, String(qtyOf(l) + 1))}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Убрать" className={`${STEP_BTN} text-[var(--danger-ink)]`} onClick={() => onRemove(l.key)}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
