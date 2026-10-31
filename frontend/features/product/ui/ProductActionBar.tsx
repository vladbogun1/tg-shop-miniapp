"use client";

import { forwardRef } from "react";
import { AddToCartControl } from "@/features/cart";
import { HoldBanner, PreorderCta } from "@/features/preorders";
import { useT } from "@/i18n/context";
import { haptic } from "@/platform/telegram";
import type { useProductPurchase } from "./use-product-purchase";

type Purchase = ReturnType<typeof useProductPurchase>;

/** Sticky bottom action bar: add to cart / pre-order button, hold banner and the stock hint. */
export const ProductActionBar = forwardRef<
  HTMLDivElement,
  { p: Purchase; onAdded?: () => void; onPreorder: () => void }
>(function ProductActionBar({ p, onAdded, onPreorder }, barRef) {
  const t = useT();
  const { hold, mode, eta, queued, buyProduct, buyVariant, needsVariant, buyable, stock, hasVariants, variant } = p;
  return (
          <div
            ref={barRef}
            className="absolute inset-x-0 bottom-0 z-10 border-t border-[var(--line)] px-4 pt-3 backdrop-blur-[12px]"
            style={{ paddingBottom: "calc(var(--tabbar-h) + var(--safe-bottom))", background: "rgba(14,14,16,.9)" }}
          >
            <div className="mx-auto w-full max-w-[480px]">
              {hold && mode === "buy" && <HoldBanner hold={hold} />}
              {mode === "pre" ? (
                <PreorderCta hasEta={!!eta} queued={!!queued} onClick={() => { haptic(); onPreorder(); }} />
              ) : (
                <AddToCartControl
                  product={buyProduct}
                  variant={buyVariant}
                  needsVariant={needsVariant}
                  fullWidth
                  onAdded={() => {
                    haptic();
                    onAdded?.();
                  }}
                />
              )}
              {/* in the pre-order state the block above already carries the hint */}
              {mode !== "pre" && (
              <p className="mt-2 text-center text-[12px] font-medium text-[var(--muted)]">
                {hold && buyable > 0
                    ? t("preorder.held.left", { n: buyable })
                    : stock > 0
                    ? t("product.stockLeft", { n: stock })
                  : hasVariants && !variant
                    ? t("addToCart.chooseVariant")
                    : t("product.outOfStock")}
              </p>
              )}
            </div>
          </div>
  );
});
