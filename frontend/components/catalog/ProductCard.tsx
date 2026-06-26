"use client";

/**
 * ProductCard — NEO-BRUTALISM tile.
 * Thick ink border + hard offset shadow, sharp corners, raw stock sticker, heavy
 * type. Same contract/behavior as before: tap photo/title → product view;
 * no-variant products get an inline AddToCartControl, variant products get a
 * "Выбрать" button that opens the view.
 */
import { SlidersHorizontal } from "lucide-react";
import { AddToCartControl } from "@/components/catalog/AddToCartControl";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { haptic } from "@/lib/telegram";
import type { Product } from "@/lib/api";

export function ProductCard({
  product,
  onOpen,
}: {
  product: Product;
  onOpen: (p: Product) => void;
}) {
  const hasVariants = (product.variants?.length ?? 0) > 0;
  const inStock = hasVariants
    ? (product.variants ?? []).some((v) => v.stock > 0)
    : (product.stock ?? 0) > 0;

  const open = () => {
    haptic();
    onOpen(product);
  };

  return (
    <div className="nb flex h-full w-full flex-col overflow-hidden">
      <button type="button" onClick={open} className="nb-press flex flex-col text-left">
        <div className="relative aspect-square w-full overflow-hidden border-b-[3px] border-[var(--line)]">
          <Image src={product.images?.[0]?.url} alt={product.title} size={600} className="h-full w-full" />
          <span
            className="absolute left-2 top-2 -rotate-2 border-[2px] border-[var(--line)] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide"
            style={{
              background: inStock ? "var(--c4)" : "var(--danger)",
              color: inStock ? "#0c2417" : "#fff",
            }}
          >
            {inStock ? "В наличии" : "Нет"}
          </span>
        </div>

        <div className="flex flex-col gap-1.5 px-2.5 pt-2.5">
          <h3 className="line-clamp-2 min-h-[2.6em] text-[13.5px] font-bold leading-snug text-[var(--ink)]">
            {product.title}
          </h3>
          <span className="self-start border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[15px] font-black text-[var(--ink)]">
            {money(product.priceMinor, product.currency)}
          </span>
        </div>
      </button>

      <div className="mt-auto p-2.5 pt-2.5">
        {hasVariants ? (
          <button
            type="button"
            onClick={open}
            disabled={!inStock}
            className="nb-accent nb-press tap nb-up flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] disabled:opacity-50"
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" strokeWidth={2.75} />
            {inStock ? "Выбрать" : "Нет в наличии"}
          </button>
        ) : (
          <AddToCartControl product={product} variant={null} fullWidth size="sm" />
        )}
      </div>
    </div>
  );
}
