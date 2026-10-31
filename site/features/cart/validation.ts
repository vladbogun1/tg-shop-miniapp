"use client";

/**
 * Re-validates the stored cart against the server: current price, current stock, still sold.
 *
 * Uses the Mini App's `GET /api/products/{id}` (unchanged) because cart lines are keyed by id. A
 * line whose product disappeared (404 / archived / inactive) is kept with stock 0 so the customer
 * sees WHY it cannot be ordered instead of it silently vanishing.
 */
import { useQuery } from "@tanstack/react-query";
import { siteCheckoutKeys } from "@shop/customer/checkout/keys";
import { STALE_TIME } from "@shop/core/query";
import { useEffect, useMemo } from "react";
import type { Product } from "@shop/core/types";
import { useI18n } from "@/i18n/context";
import { api, ApiError } from "@/lib/api";
import { stockOf } from "@shop/customer/catalog/model/stock";
import { useCart } from "./store";
import { holdFloor } from "@/features/preorder";

type CartLine = ReturnType<typeof useCart.getState>["lines"][number];

const soldOut = (l: CartLine): CartLine => (l.stock === 0 ? l : { ...l, stock: 0 });

const variantOf = (l: CartLine, p: Product) => (l.variantId ? p.variants?.find((v) => v.id === l.variantId) ?? null : null);

/** The stored line brought in line with the fresh server product (same object when nothing changed). */
function refreshLine(l: CartLine, fresh: Map<string, Product | null>): CartLine {
  if (!fresh.has(l.productId)) return l;
  const p = fresh.get(l.productId);
  if (!p || p.active === false || p.archived) return soldOut(l);
  const variant = variantOf(l, p);
  if (l.variantId && !variant) return soldOut(l);
  return repriceLine(l, p, variant);
}

/** Stock, quantity and price of a line against its live product (same object when nothing changed). */
function repriceLine(l: CartLine, p: Product, variant: ReturnType<typeof variantOf>): CartLine {
  // the catalog stock excludes units held for pre-order queues — mine included (lib/preorder)
  const stock = holdFloor(l.productId, l.variantId, Math.max(0, stockOf(p, variant)));
  const priceChanged = p.priceMinor !== l.priceMinor;
  const quantity = stock > 0 ? Math.min(Math.max(l.quantity, 1), stock) : l.quantity;
  if (!priceChanged && stock === l.stock && quantity === l.quantity) return l;
  return {
    ...l,
    stock,
    quantity,
    priceMinor: p.priceMinor,
    title: p.title,
    previousPriceMinor: priceChanged ? l.priceMinor : l.previousPriceMinor ?? null,
  };
}

export function useCartValidation(enabled = true) {
  const lines = useCart((s) => s.lines);
  const patchLines = useCart((s) => s.patchLines);
  const { locale } = useI18n();
  const ids = useMemo(
    () => Array.from(new Set(lines.map((l) => l.productId))).sort(),
    [lines]
  );

  const query = useQuery({
    queryKey: siteCheckoutKeys.cartValidate(ids, locale),
    enabled: enabled && ids.length > 0,
    staleTime: STALE_TIME.list,
    queryFn: async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            return [id, (await api.productById(id)) as Product] as const;
          } catch (e) {
            if (e instanceof ApiError && e.status === 404) return [id, null] as const;
            throw e;
          }
        })
      );
      return new Map<string, Product | null>(entries);
    },
  });

  useEffect(() => {
    const fresh = query.data;
    if (!fresh) return;
    patchLines((current) => current.map((l) => refreshLine(l, fresh)));
  }, [query.data, patchLines]);

  return { validating: query.isFetching, error: query.isError };
}
