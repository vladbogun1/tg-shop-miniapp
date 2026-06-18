"use client";

/**
 * AddToCartControl — reusable "add → −qty+" morph control (roadmap rework).
 *
 * - qty 0  → single accent "В корзину" GlassButton.
 * - qty >0 → the SAME control morphs into an inline glass "− [qty] +" stepper.
 *            − at qty 1 removes the line; + clamps to available stock.
 * - Disabled (with hint) when out of stock or a variant is required but unset.
 *
 * Wired directly to lib/cart.ts. The line is keyed by productId::variantId, so
 * the control reflects the live qty for the *current* product/variant selection.
 *
 * Used in BOTH the product view (top action area) and catalog cards. In cards
 * the +/- taps must NOT bubble to the card's onOpen — callers pass an onPointer
 * boundary; this component already calls stopPropagation on its own clicks.
 */
import { motion } from "framer-motion";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { GlassButton } from "@/components/ui/GlassButton";
import { lineKey, useCart } from "@/lib/cart";
import type { Product, ProductVariant } from "@/lib/api";

export function AddToCartControl({
  product,
  variant,
  /** When true → render the disabled "select a variant" hint state. */
  needsVariant = false,
  fullWidth = false,
  size = "md",
  /** Fired right after a successful add (qty 0 → 1) — e.g. toast + haptic. */
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
  // Subscribe to this line's quantity so the control re-renders live.
  const qty = useCart((s) => s.lines.find((l) => l.key === key)?.quantity ?? 0);

  const stock = variant ? variant.stock : (product.stock ?? 0);
  const outOfStock = stock <= 0;
  const atMax = qty >= stock;

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // ── Disabled states ───────────────────────────────────────────────────────
  if (needsVariant) {
    return (
      <GlassButton
        variant="glass"
        fullWidth={fullWidth}
        size={size}
        disabled
        onClick={stop}
        icon={<ShoppingCart className="h-4 w-4 shrink-0" />}
      >
        Выберите вариант
      </GlassButton>
    );
  }
  if (outOfStock) {
    return (
      <GlassButton variant="glass" fullWidth={fullWidth} size={size} disabled onClick={stop}>
        Нет в наличии
      </GlassButton>
    );
  }

  // ── qty 0 → single "В корзину" button ─────────────────────────────────────
  if (qty === 0) {
    return (
      <GlassButton
        variant="accent"
        fullWidth={fullWidth}
        size={size}
        icon={<ShoppingCart className="h-4 w-4 shrink-0" />}
        onClick={(e) => {
          stop(e);
          add(product, variant, 1);
          onAdded?.();
        }}
      >
        В корзину
      </GlassButton>
    );
  }

  // ── qty >0 → inline "− [qty] +" stepper (glass) ───────────────────────────
  const dims = size === "sm" ? "h-9 px-1" : "h-11 px-1";
  const btnDim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const numDim = size === "sm" ? "min-w-[26px] text-[14px]" : "min-w-[34px] text-[16px]";

  return (
    <div
      onClick={stop}
      className={`glass inline-flex items-center justify-between rounded-[var(--r-pill)] ${dims} ${
        fullWidth ? "w-full" : ""
      }`}
    >
      <motion.button
        type="button"
        aria-label="Уменьшить"
        whileTap={{ scale: 0.9 }}
        onClick={(e) => {
          stop(e);
          dec(key);
        }}
        className={`flex items-center justify-center rounded-[var(--r-pill)] text-[var(--text)] ${btnDim}`}
      >
        <Minus className="h-4 w-4" />
      </motion.button>
      <span className={`text-center font-semibold text-[var(--text)] ${numDim}`}>
        {qty}
      </span>
      <motion.button
        type="button"
        aria-label="Увеличить"
        whileTap={{ scale: 0.9 }}
        disabled={atMax}
        onClick={(e) => {
          stop(e);
          inc(key);
        }}
        className={`flex items-center justify-center rounded-[var(--r-pill)] text-[var(--text)] transition-opacity disabled:opacity-30 ${btnDim}`}
      >
        <Plus className="h-4 w-4" />
      </motion.button>
    </div>
  );
}
