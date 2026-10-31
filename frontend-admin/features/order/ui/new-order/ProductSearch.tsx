"use client";

import { Search } from "lucide-react";
import type { Product, ProductVariant } from "@shop/core/types";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { Input } from "@/components/ui/Input";
import { effectiveStock } from "../../model/item-picker";

interface Props {
  q: string;
  onQ: (q: string) => void;
  found: Product[];
  onAdd: (product: Product, variant: ProductVariant | null) => void;
}

function FoundRow({ p, onAdd }: { p: Product; onAdd: Props["onAdd"] }) {
  const hasVariants = !!p.variants && p.variants.length > 0;
  const eff = effectiveStock(p);
  return (
    <div className={cn("card-2 flex flex-col gap-2 p-2", eff <= 0 && "opacity-50")}>
      <button type="button" disabled={hasVariants} onClick={() => onAdd(p, null)} className="flex items-center gap-3 text-left">
        <Image
          src={p.images?.[0]?.url}
          alt={p.title}
          size={96}
          className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
        />
        <span className="min-w-0 flex-1 line-clamp-2 break-words text-[13.5px] leading-snug font-semibold text-[var(--text)]">{p.title}</span>
        <span className="tabular shrink-0 text-right text-[12px] text-[var(--text-faint)]">
          {money(p.priceMinor, p.currency)}
          <br />
          {eff} шт
        </span>
      </button>
      {hasVariants && (
        <div className="flex flex-wrap gap-1.5 pl-[52px]">
          {(p.variants ?? []).map((v) => (
            <button
              key={v.id ?? v.name}
              type="button"
              onClick={() => onAdd(p, v)}
              className={cn(
                "nb-chip nb-press h-8 px-3 text-[12.5px] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]",
                (v.stock ?? 0) <= 0 && "opacity-50"
              )}
            >
              {v.name} · {v.stock ?? 0}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Поиск товара по названию и добавление (с вариантом) в ручной заказ. */
export function ProductSearch({ q, onQ, found, onAdd }: Props) {
  return (
    <>
      <Input icon={<Search className="h-4 w-4" />} value={q} onChange={(e) => onQ(e.target.value)} placeholder="Найти товар по названию…" />
      {q.trim() && (
        <div className="thin-scroll flex max-h-64 flex-col gap-1.5 overflow-auto">
          {found.map((p) => (
            <FoundRow key={p.id} p={p} onAdd={onAdd} />
          ))}
          {found.length === 0 && <p className="p-2 text-[13px] text-[var(--text-faint)]">Ничего не найдено.</p>}
        </div>
      )}
    </>
  );
}
