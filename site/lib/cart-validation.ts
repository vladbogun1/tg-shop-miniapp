"use client";

/**
 * Re-validates the stored cart against the server: current price, current stock, still sold.
 *
 * Uses the Mini App's `GET /api/products/{id}` (unchanged) because cart lines are keyed by id. A
 * line whose product disappeared (404 / archived / inactive) is kept with stock 0 so the customer
 * sees WHY it cannot be ordered instead of it silently vanishing.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { Product } from "@shop/shared";
import { useI18n } from "@/i18n/context";
import { api, ApiError } from "./api";
import { stockOf, useCart } from "./cart";

export function useCartValidation(enabled = true) {
  const lines = useCart((s) => s.lines);
  const patchLines = useCart((s) => s.patchLines);
  const { locale } = useI18n();
  const ids = useMemo(
    () => Array.from(new Set(lines.map((l) => l.productId))).sort(),
    [lines]
  );

  const query = useQuery({
    queryKey: ["cart-validate", ids, locale],
    enabled: enabled && ids.length > 0,
    staleTime: 30_000,
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
    patchLines((current) =>
      current.map((l) => {
        if (!fresh.has(l.productId)) return l;
        const p = fresh.get(l.productId);
        if (!p || p.active === false || p.archived) {
          return l.stock === 0 ? l : { ...l, stock: 0 };
        }
        const variant = l.variantId ? p.variants?.find((v) => v.id === l.variantId) ?? null : null;
        if (l.variantId && !variant) return l.stock === 0 ? l : { ...l, stock: 0 };
        const stock = Math.max(0, stockOf(p, variant));
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
      })
    );
  }, [query.data, patchLines]);

  return { validating: query.isFetching, error: query.isError };
}
