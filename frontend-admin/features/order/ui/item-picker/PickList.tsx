"use client";

import { Search } from "lucide-react";
import type { Product } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { Input } from "@/components/ui/Input";
import { effectiveStock } from "../../model/item-picker";

interface Props {
  q: string;
  onQ: (q: string) => void;
  products: Product[];
  onPick: (p: Product) => void;
}

/** Шаг 1 «Добавить в заказ»: поиск товара. */
export function PickList({ q, onQ, products, onPick }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <Input label="Поиск товара" icon={<Search className="h-4 w-4" />} value={q} onChange={(e) => onQ(e.target.value)} placeholder="Название…" />
      <div className="thin-scroll flex max-h-72 flex-col gap-1.5 overflow-auto">
        {products.map((p) => {
          const eff = effectiveStock(p);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              disabled={eff <= 0}
              className={cn(
                "card-2 flex shrink-0 items-center gap-3 p-2 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]",
                eff <= 0 && "opacity-40"
              )}
            >
              <Image src={p.images?.[0]?.url} alt={p.title} size={96} className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]" />
              <span className="min-w-0 flex-1 line-clamp-2 break-words text-[14px] leading-snug font-semibold text-[var(--text)]">{p.title}</span>
              <span className="tabular shrink-0 pr-1 text-[12px] font-medium text-[var(--text-faint)]">{eff} шт</span>
            </button>
          );
        })}
        {products.length === 0 && <p className="p-2 text-[13px] text-[var(--text-faint)]">Ничего не найдено.</p>}
      </div>
    </div>
  );
}
