"use client";

/**
 * Website cart — zustand persisted to localStorage under its own key (`site-cart-v1`).
 *
 * Same line model as the Mini App (`frontend/lib/cart.ts`): one line per product+variant, a price
 * snapshot, and the stock captured at add time to clamp the quantity. The snapshot is only a
 * snapshot: {@link useCartValidation} re-reads every line from the server and corrects price and
 * stock, because a cart can sit in a browser for weeks.
 *
 * The drawer's open/closed state lives here too, so "В корзину" anywhere can open it.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product, ProductVariant, StorefrontProduct } from "@shop/shared";
import { stockOf } from "./stock";

export { stockOf };

export interface CartLine {
  key: string;
  productId: string;
  /** For links back to the product page; absent on lines added before slugs existed. */
  slug?: string | null;
  variantId: string | null;
  variantName: string | null;
  title: string;
  priceMinor: number;
  currency: string;
  imageUrl: string | null;
  stock: number;
  quantity: number;
  /** Set by validation when the server price differs from the snapshot the customer saw. */
  previousPriceMinor?: number | null;
}

export function lineKey(productId: string, variantId?: string | null): string {
  return `${productId}::${variantId ?? ""}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

interface CartState {
  lines: CartLine[];
  promoCode: string;
  drawerOpen: boolean;

  add: (product: Product | StorefrontProduct, variant: ProductVariant | null, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setPromoCode: (code: string) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** Replace lines with server-corrected values (see useCartValidation). */
  patchLines: (patch: (lines: CartLine[]) => CartLine[]) => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      promoCode: "",
      drawerOpen: false,

      add: (product, variant, qty = 1) => {
        const variantId = variant?.id ?? null;
        const key = lineKey(product.id, variantId);
        const stock = stockOf(product, variant);
        if (stock <= 0) return;
        const slug = "slug" in product ? product.slug : null;
        set((state) => {
          const existing = state.lines.find((l) => l.key === key);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.key === key
                  ? { ...l, quantity: clamp(l.quantity + qty, 1, stock), stock, slug: slug ?? l.slug }
                  : l
              ),
            };
          }
          const images = (product.images ?? [])
            .slice()
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          const line: CartLine = {
            key,
            productId: product.id,
            slug,
            variantId,
            variantName: variant?.name ?? null,
            title: product.title,
            priceMinor: product.priceMinor,
            currency: product.currency ?? "UAH",
            imageUrl: images[0]?.url ?? null,
            stock,
            quantity: clamp(qty, 1, stock),
          };
          return { lines: [...state.lines, line] };
        });
      },

      setQty: (key, qty) =>
        set((state) => ({
          lines: state.lines
            .map((l) => (l.key === key ? { ...l, quantity: clamp(qty, 0, Math.max(l.stock, 0)) } : l))
            .filter((l) => l.quantity > 0 || l.stock <= 0),
        })),

      remove: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),
      clear: () => set({ lines: [], promoCode: "" }),
      setPromoCode: (code) => set({ promoCode: code }),
      openDrawer: () => set({ drawerOpen: true }),
      closeDrawer: () => set({ drawerOpen: false }),
      patchLines: (patch) => set((state) => ({ lines: patch(state.lines) })),
    }),
    {
      name: "site-cart-v1",
      partialize: (s) => ({ lines: s.lines, promoCode: s.promoCode }),
    }
  )
);

export function useCartCount(): number {
  return useCart((s) => s.lines.reduce((sum, l) => sum + l.quantity, 0));
}

/** Only lines that can actually be ordered (in stock, qty > 0). */
export function useCartSubtotal(): number {
  return useCart((s) =>
    s.lines.reduce((sum, l) => (l.stock > 0 ? sum + l.priceMinor * l.quantity : sum), 0)
  );
}
