"use client";

/**
 * Liquid-glass product card (design doc §8.4): photo with blur-up, title, price,
 * stock badge. Micro press lift on the photo/title area.
 *
 * Rework: the card carries an inline add-to-cart control at the bottom.
 *  - Product WITHOUT variants → AddToCartControl ("В корзину" → "− qty +").
 *    The +/- taps call stopPropagation so they don't open the product view.
 *  - Product WITH variants → a "Выбрать" GlassButton that opens the product
 *    view (variant must be picked there before adding).
 * Tapping the photo/title always opens the product view.
 */
import { motion } from "framer-motion";
import { AddToCartControl } from "@/components/catalog/AddToCartControl";
import { GlassButton } from "@/components/ui/GlassButton";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
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

  return (
    <div className="glass glass--noise relative flex h-full flex-col overflow-hidden rounded-[var(--r-lg)] p-2 text-left">
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        onClick={() => onOpen(product)}
        className="flex flex-col text-left"
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-[var(--r-md)]">
          <Image
            src={product.images?.[0]?.url}
            alt={product.title}
            size={600}
            className="h-full w-full"
          />
          <span
            className="absolute left-2 top-2 rounded-[var(--r-pill)] px-2 py-0.5 text-[10px] font-semibold backdrop-blur"
            style={{
              background: inStock
                ? "color-mix(in srgb, var(--ok) 24%, transparent)"
                : "color-mix(in srgb, var(--danger) 24%, transparent)",
              color: inStock ? "var(--ok)" : "var(--danger)",
            }}
          >
            {inStock ? "В наличии" : "Нет в наличии"}
          </span>
        </div>
        <div className="flex flex-col gap-1 px-1 pt-2">
          <h3 className="line-clamp-2 min-h-[2.6em] text-[14px] font-semibold leading-snug text-[var(--text)]">
            {product.title}
          </h3>
          <p className="text-[15px] font-bold text-[var(--accent)]">
            {money(product.priceMinor, product.currency)}
          </p>
        </div>
      </motion.button>

      {/* inline action — pinned to the bottom so buttons align across cards */}
      <div className="mt-auto px-1 pb-1 pt-2">
        {hasVariants ? (
          <GlassButton
            variant="accent"
            fullWidth
            disabled={!inStock}
            onClick={() => onOpen(product)}
          >
            {inStock ? "Выбрать" : "Нет в наличии"}
          </GlassButton>
        ) : (
          <AddToCartControl product={product} variant={null} fullWidth size="sm" />
        )}
      </div>
    </div>
  );
}
