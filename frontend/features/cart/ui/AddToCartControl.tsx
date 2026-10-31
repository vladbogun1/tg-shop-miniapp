"use client";

/**
 * AddToCartControl — "add → −qty+" morph control (ChiSetup).
 * Cart logic is UNCHANGED (add / inc / dec, keyed by productId::variantId,
 * minus-at-1 removes the line, + clamps to stock, stopPropagation in cards).
 * Only the styling changed: chamfered orange CTA, quiet graphite stepper, soft press.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { useT } from "@/i18n/context";
import { trackAddToCart } from "@/lib/analytics";
import { lineKey, useCart } from "@/features/cart/store";
import { maxQty } from "@shop/core/orders";
import { useOrderLimits } from "@/features/cart/order-limits";
import { haptic } from "@/platform/telegram";
import type { Product, ProductVariant } from "@/lib/api";

type Size = "sm" | "md";
type Tr = ReturnType<typeof useT>;
type Common = { size: Size; fullWidth: boolean; t: Tr };
type ClickHandler = (e: React.MouseEvent) => void;

const stop: ClickHandler = (e) => e.stopPropagation();

// One height for every state (add / disabled / stepper / "choose" on the card): 44px sm, 48px md.
const heightClass = (size: Size) => (size === "sm" ? "h-11 text-[13px]" : "h-12 text-[15px]");
const iconClass = (size: Size) => `h-4 w-4 shrink-0 ${size === "sm" ? "max-[359px]:hidden" : ""}`;
const widthClass = (fullWidth: boolean) => (fullWidth ? "w-full" : "");

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
  size?: Size;
  onAdded?: () => void;
}) {
  const t = useT();
  const variantId = variant?.id ?? null;
  const key = lineKey(product.id, variantId);

  const add = useCart((s) => s.add);
  const limits = useOrderLimits();
  const inc = useCart((s) => s.inc);
  const dec = useCart((s) => s.dec);
  const qty = useCart((s) => s.lines.find((l) => l.key === key)?.quantity ?? 0);

  const stock = variant ? variant.stock : (product.stock ?? 0);
  const outOfStock = stock <= 0;
  // Stock, and the anti-bot cap per product (antibot.maxQtyPerProduct) when it is lower.
  const atMax = qty >= maxQty(stock, limits);

  const common = { size, fullWidth, t };

  if (needsVariant || outOfStock) return <DisabledAdd {...common} needsVariant={needsVariant} />;

  if (qty === 0) {
    return (
      <AddButton
        {...common}
        onAdd={(e) => {
          stop(e);
          haptic();
          add(product, variant, 1);
          trackAddToCart(product.id, variantId, 1);
          onAdded?.();
        }}
      />
    );
  }

  return (
    <Stepper
      {...common}
      qty={qty}
      atMax={atMax}
      onDec={(e) => {
        stop(e);
        haptic();
        dec(key);
      }}
      onInc={(e) => {
        stop(e);
        haptic();
        inc(key);
      }}
    />
  );
}

function DisabledAdd({ size, fullWidth, t, needsVariant }: Common & { needsVariant: boolean }) {
  return (
    <button
      type="button"
      disabled
      onClick={stop}
      className={`nb-up inline-flex items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-4 font-semibold text-[var(--faint)] ${heightClass(size)} ${widthClass(fullWidth)}`}
    >
      <ShoppingCart className={iconClass(size)} strokeWidth={2.25} />
      {needsVariant ? t("addToCart.chooseVariant") : t("product.outOfStock")}
    </button>
  );
}

function AddButton({ size, fullWidth, t, onAdd }: Common & { onAdd: ClickHandler }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className={`nb-accent nb-press nb-up inline-flex items-center justify-center gap-2 px-4 ${heightClass(size)} ${widthClass(fullWidth)}`}
    >
      {/* tiles on a 320 px phone: without the icon «В корзину» stays on one line */}
      <ShoppingCart className={iconClass(size)} strokeWidth={2.5} />
      {t("addToCart.add")}
    </button>
  );
}

function Stepper({
  size,
  fullWidth,
  t,
  qty,
  atMax,
  onDec,
  onInc,
}: Common & { qty: number; atMax: boolean; onDec: ClickHandler; onInc: ClickHandler }) {
  const btnDim = size === "sm" ? "h-[34px] w-[34px]" : "h-[38px] w-[38px]"; // + p-1 + 1px border = 44 / 48
  const numDim = size === "sm" ? "min-w-[26px] text-[15px]" : "min-w-[34px] text-[17px]";

  return (
    <div
      onClick={stop}
      className={`inline-flex items-center justify-between rounded-[calc(var(--r)+4px)] border border-[var(--line)] bg-[var(--surface-2)] p-1 ${widthClass(fullWidth)}`}
    >
      <button
        type="button"
        aria-label={qty === 1 ? t("addToCart.remove") : t("qty.decrease")}
        onClick={onDec}
        className={`nb-press grid place-items-center rounded-[var(--r)] bg-[var(--surface-3)] text-[var(--ink)] ${btnDim}`}
      >
        <Minus className="h-4 w-4" strokeWidth={2.5} />
      </button>

      <span className={`font-display relative text-center font-bold tabular-nums text-[var(--ink)] ${numDim}`}>
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
        aria-label={t("qty.increase")}
        disabled={atMax}
        onClick={onInc}
        className={`nb-press grid place-items-center rounded-[var(--r)] text-[var(--accent-ink)] transition-opacity disabled:opacity-30 ${btnDim}`}
        style={{ background: "var(--accent)" }}
      >
        <Plus className="h-4 w-4" strokeWidth={2.75} />
      </button>
    </div>
  );
}
