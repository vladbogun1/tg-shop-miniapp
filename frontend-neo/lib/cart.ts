"use client";

/**
 * Cart store (zustand, persisted to localStorage).
 *
 * Lines are keyed by `${productId}::${variantId ?? ""}` so the same product
 * with different variants are distinct lines. Quantities are clamped to the
 * captured stock at add/setQty time. Money is in minor units (÷100 via money()).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product, ProductVariant } from "@/lib/api";

export interface CartLine {
  key: string;
  productId: string;
  variantId: string | null;
  variantName: string | null;
  title: string;
  priceMinor: number;
  currency: string;
  imageUrl: string | null;
  /** Stock available for this product/variant — qty is clamped to it. */
  stock: number;
  quantity: number;
}

export function lineKey(productId: string, variantId?: string | null): string {
  return `${productId}::${variantId ?? ""}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

interface CartState {
  lines: CartLine[];
  /** Promo code typed by the user (validated server-side at checkout). */
  promoCode: string;

  add: (
    product: Product,
    variant: ProductVariant | null,
    qty?: number
  ) => void;
  setQty: (key: string, qty: number) => void;
  inc: (key: string) => void;
  dec: (key: string) => void;
  remove: (key: string) => void;
  clear: () => void;
  setPromoCode: (code: string) => void;

  // selectors (call via store getState in non-react ctx)
  totalQuantity: () => number;
  subtotalMinor: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      promoCode: "",

      add: (product, variant, qty = 1) => {
        const variantId = variant?.id ?? null;
        const key = lineKey(product.id, variantId);
        const stock = variant ? variant.stock : (product.stock ?? 0);
        if (stock <= 0) return;

        set((state) => {
          const existing = state.lines.find((l) => l.key === key);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.key === key
                  ? { ...l, quantity: clamp(l.quantity + qty, 1, stock), stock }
                  : l
              ),
            };
          }
          const line: CartLine = {
            key,
            productId: product.id,
            variantId,
            variantName: variant?.name ?? null,
            title: product.title,
            priceMinor: product.priceMinor,
            currency: product.currency ?? "UAH",
            imageUrl: product.images?.[0]?.url ?? null,
            stock,
            quantity: clamp(qty, 1, stock),
          };
          return { lines: [...state.lines, line] };
        });
      },

      setQty: (key, qty) =>
        set((state) => ({
          lines: state.lines
            .map((l) =>
              l.key === key
                ? { ...l, quantity: clamp(qty, 0, l.stock) }
                : l
            )
            .filter((l) => l.quantity > 0),
        })),

      inc: (key) => {
        const l = get().lines.find((x) => x.key === key);
        if (l) get().setQty(key, l.quantity + 1);
      },
      dec: (key) => {
        const l = get().lines.find((x) => x.key === key);
        if (l) get().setQty(key, l.quantity - 1);
      },

      remove: (key) =>
        set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),

      clear: () => set({ lines: [], promoCode: "" }),
      setPromoCode: (code) => set({ promoCode: code }),

      totalQuantity: () =>
        get().lines.reduce((sum, l) => sum + l.quantity, 0),
      subtotalMinor: () =>
        get().lines.reduce((sum, l) => sum + l.priceMinor * l.quantity, 0),
    }),
    {
      name: "tgshop-cart-v1",
      // only persist data, not the action fns
      partialize: (s) => ({ lines: s.lines, promoCode: s.promoCode }),
    }
  )
);

/** Hook: total quantity (re-renders on change). */
export function useCartCount(): number {
  return useCart((s) => s.lines.reduce((sum, l) => sum + l.quantity, 0));
}

/** Hook: subtotal in minor units (re-renders on change). */
export function useCartSubtotal(): number {
  return useCart((s) =>
    s.lines.reduce((sum, l) => sum + l.priceMinor * l.quantity, 0)
  );
}
