"use client";

/**
 * AddToCartControl — "add → −qty+" morph control (NEO-BRUTALISM).
 * Cart logic is UNCHANGED (add / inc / dec, keyed by productId::variantId,
 * minus-at-1 removes the line, + clamps to stock, stopPropagation in cards).
 * Only the styling is neo: sharp corners, thick borders, hard shadow, press.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { lineKey, useCart } from "@/lib/cart";
import { haptic } from "@/lib/telegram";
import type { Product, ProductVariant } from "@/lib/api";

export function AddToCartControl({
  product,
  variant,
  needsVariant = false,
  fullWidth = false,
  size = "md",
  onAdded,
}: {
  product: Product;
  variant: ProductVariant | null;
  needsVariant?: boolean;
  fullWidth?: boolean;
  size?: "sm" | "md";
  onAdded?: () => void;
}) {
  const variantId = variant?.id ?? null;
  const key = lineKey(product.id, variantId);

  const add = useCart((s) => s.add);
  const inc = useCart((s) => s.inc);
  const dec = useCart((s) => s.dec);
  const qty = useCart((s) => s.lines.find((l) => l.key === key)?.quantity ?? 0);

  const stock = variant ? variant.stock : (product.stock ?? 0);
  const outOfStock = stock <= 0;
  const atMax = qty >= stock;

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const h = size === "sm" ? "py-2.5 text-[13px]" : "py-3.5 text-[15px]";

  if (needsVariant || outOfStock) {
    return (
      <button
        type="button"
        disabled
        onClick={stop}
        className={`nb-flat nb-up inline-flex items-center justify-center gap-2 px-4 font-extrabold text-[var(--muted)] opacity-70 ${h} ${fullWidth ? "w-full" : ""}`}
      >
        <ShoppingCart className="h-4 w-4 shrink-0" strokeWidth={2.75} />
        {needsVariant ? "Выберите вариант" : "Нет в наличии"}
      </button>
    );
  }

  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          haptic();
          add(product, variant, 1);
          onAdded?.();
        }}
        className={`nb-accent nb-press nb-up inline-flex items-center justify-center gap-2 px-4 ${h} ${fullWidth ? "w-full" : ""}`}
      >
        <ShoppingCart className="h-4 w-4 shrink-0" strokeWidth={2.75} />
        В корзину
      </button>
    );
  }

  const btnDim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const numDim = size === "sm" ? "min-w-[26px] text-[15px]" : "min-w-[34px] text-[17px]";

  return (
    <div
      onClick={stop}
      className={`nb-flat inline-flex items-center justify-between p-1 ${fullWidth ? "w-full" : ""}`}
    >
      <button
        type="button"
        aria-label={qty === 1 ? "Убрать из корзины" : "Уменьшить"}
        onClick={(e) => {
          stop(e);
          haptic();
          dec(key);
        }}
        className={`nb-press grid place-items-center border-[2.5px] border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] ${btnDim}`}
      >
        <Minus className="h-4 w-4" strokeWidth={3} />
      </button>

      <span className={`relative text-center font-black tabular-nums text-[var(--ink)] ${numDim}`}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={qty}
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="block"
          >
            {qty}
          </motion.span>
        </AnimatePresence>
      </span>

      <button
        type="button"
        aria-label="Увеличить"
        disabled={atMax}
        onClick={(e) => {
          stop(e);
          haptic();
          inc(key);
        }}
        className={`nb-press grid place-items-center border-[2.5px] border-[var(--line)] text-[var(--accent-ink)] transition-opacity disabled:opacity-30 ${btnDim}`}
        style={{ background: "var(--accent)" }}
      >
        <Plus className="h-4 w-4" strokeWidth={3} />
      </button>
    </div>
  );
}
