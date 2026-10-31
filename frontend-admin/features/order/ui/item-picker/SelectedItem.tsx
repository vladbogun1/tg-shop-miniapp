"use client";

import type { Product, ProductVariant } from "@shop/core/types";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";

interface Props {
  product: Product;
  variant: ProductVariant | null;
  onVariant: (v: ProductVariant) => void;
  qtyText: string;
  qty: number;
  available: number;
  onQtyText: (t: string) => void;
  onQtyBlur: () => void;
  gift: boolean;
  onGift: (v: boolean) => void;
  onReset: () => void;
}

function VariantChips({ product, variant, onVariant }: Pick<Props, "product" | "variant" | "onVariant">) {
  return (
    <div>
      <label className="field-label mb-1.5 block">Вариант</label>
      <div className="flex flex-wrap gap-2">
        {(product.variants ?? []).map((v) => (
          <button
            key={v.id ?? v.name}
            type="button"
            disabled={(v.stock ?? 0) <= 0}
            onClick={() => onVariant(v)}
            className={cn(
              "nb-chip nb-press h-8 px-3.5 text-[12.5px] transition-colors",
              variant?.name === v.name ? "nb-chip-active" : "text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]",
              (v.stock ?? 0) <= 0 && "opacity-40"
            )}
          >
            {v.name} · {v.stock ?? 0}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Шаг 2 «Добавить в заказ»: вариант, количество, подарок. */
export function SelectedItem(p: Props) {
  const { product, qty, gift } = p;
  const hasVariants = !!product.variants && product.variants.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Image src={product.images?.[0]?.url} alt={product.title} size={120} className="h-14 w-14 shrink-0 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)]" />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 break-words text-[15px] leading-snug font-semibold text-[var(--text)]">{product.title}</div>
          <div className="text-[12px] text-[var(--text-faint)]">
            {gift
              ? `Цена ${money(product.priceMinor, product.currency)} → в подарок 0 ₴`
              : `Цена ${money(product.priceMinor, product.currency)} × ${qty} = ${money(product.priceMinor * qty, product.currency)}`}
          </div>
        </div>
        <button type="button" onClick={p.onReset} className="font-display hit shrink-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--accent-hi)] hover:underline">
          Другой
        </button>
      </div>

      {hasVariants && <VariantChips product={product} variant={p.variant} onVariant={p.onVariant} />}

      <div className="flex items-end gap-3">
        <Input
          label={`Количество (доступно ${p.available})`}
          inputMode="numeric"
          className="w-40"
          value={p.qtyText}
          onChange={(e) => p.onQtyText(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onBlur={p.onQtyBlur}
        />
        {qty > p.available && <span className="pb-3 text-[12px] font-semibold text-[var(--danger-ink)]">Не хватает на складе</span>}
      </div>

      <div className="card-2 px-3.5 py-3">
        <Toggle checked={gift} onChange={p.onGift} label="🎁 Подарок (бесплатно)" />
        <p className="mt-1 text-[12px] text-[var(--text-faint)]">
          {gift ? "Позиция добавится за 0 ₴ (итог не изменится)." : "Обычная платная позиция — итог заказа увеличится."}
        </p>
      </div>
    </div>
  );
}
