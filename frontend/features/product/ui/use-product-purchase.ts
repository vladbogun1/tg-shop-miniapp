"use client";

/**
 * What can be bought on the product view: chosen variant, stock net of reservations, pre-order / hold
 * state and the resulting mode of the action bar.
 */
import { useState } from "react";
import { availabilityOf } from "@shop/core/availability";
import { heldFor, queuedFor, useComing, useMyPreorders, useProductPreorder } from "@/features/preorders";
import type { Product, ProductVariant } from "@/lib/api";
import { useAccessToken } from "@/lib/auth";
import { purchaseMode, stockOf, withHeldStock } from "../model/mode";

/** Pre-orders: stock is net of reservations (mine too), so a unit held for me is added back by the caller. */
function usePreorderState(product: Product, lineVariantId: string | null, needsVariant: boolean) {
  const token = useAccessToken();
  const preQ = useProductPreorder(product.id);
  const coming = useComing();
  const mineAll = useMyPreorders().list;
  const hold = needsVariant ? undefined : heldFor(mineAll, product.id, lineVariantId);
  const queued = needsVariant ? undefined : queuedFor(mineAll, product.id, lineVariantId);
  const eta = needsVariant
    ? undefined
    : (preQ.data?.lines.find((l) => (l.variantId ?? null) === lineVariantId)?.eta ?? coming.etaOf(product.id, lineVariantId));
  const canNotify = !!token && preQ.data?.anyProduct !== false;
  const holdHours = preQ.data?.holdHours ?? coming.holdHoursOf(product.id);
  return { preQ, coming, mineAll, hold, queued, eta, canNotify, holdHours };
}

export function useProductPurchase(product: Product) {
  const hasVariants = (product.variants?.length ?? 0) > 0;
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  const [touchedVariant, setTouchedVariant] = useState(false);

  const needsVariant = hasVariants && !variant;
  const stock = stockOf(product, variant, hasVariants);

  const lineVariantId = hasVariants ? (variant?.id ?? null) : null;
  const pre = usePreorderState(product, lineVariantId, needsVariant);
  const { hold, eta, canNotify } = pre;
  const buyable = stock + (hold?.heldQty ?? 0);
  const avail = availabilityOf(product, variant, { coming: !!eta, heldQty: hold?.heldQty });
  const mode = purchaseMode(needsVariant, avail, canNotify);
  const { buyProduct, buyVariant } = withHeldStock(product, variant, hasVariants, !!hold, buyable);
  return {
    hasVariants, variant, setVariant, touchedVariant, setTouchedVariant, needsVariant, stock, ...pre,
    buyable, mode, buyProduct, buyVariant,
  };
}
