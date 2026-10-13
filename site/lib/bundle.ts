"use client";

/**
 * «Разом дешевше» on the website: the cart quote (bundle vs promo, add-on lines, suggestions, the
 * gift for the sum) shared by the cart page, the drawer and the checkout. The numbers are for showing
 * only — the server prices the order again at checkout the same way.
 *
 * Several components on one screen ask for the same quote: react-query dedupes them by key (lines +
 * promo discount), and the key settles after a short debounce so a quantity stepper does not fire a
 * request per click.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type BundleQuote, bundleLineKey, bundlePercent, bundleQuoteBody } from "@shop/shared";
import { api } from "./api";
import { useCart } from "./cart";
import { useDebounced } from "./hooks";

const DEBOUNCE_MS = 350;

export interface BundleQuoteState {
  /** Quote for the CURRENT lines (null while loading, on error, or for an empty cart). */
  quote: BundleQuote | null;
  loading: boolean;
  /** Bundle percent per add-on line key (`productId::variantId`). */
  addonPercent: Map<string, number>;
  /** Percent the next add-on would bring the bundle to (0 = no further tier). */
  nextPercent: number;
}

/**
 * Quote of the cart. `promoDiscountMinor` — what the customer's promo code gives (so the server
 * says which discount wins); omit/0 when there is no code. `active` = false asks nothing (a closed
 * drawer).
 */
export function useBundleQuote(promoDiscountMinor = 0, active = true): BundleQuoteState {
  const lines = useCart((s) => s.lines);
  const orderable = useMemo(
    () =>
      lines
        .filter((l) => l.stock > 0 && l.quantity > 0)
        .map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
    [lines]
  );
  const liveKey = JSON.stringify([orderable, promoDiscountMinor]);
  const settledKey = useDebounced(liveKey, DEBOUNCE_MS);
  const settled = settledKey === liveKey;

  const query = useQuery({
    queryKey: ["bundle-quote", settledKey],
    enabled: active && orderable.length > 0,
    staleTime: 30_000,
    retry: 1,
    queryFn: () => {
      const [l, promo] = JSON.parse(settledKey) as [typeof orderable, number];
      return api.bundleQuote(bundleQuoteBody(l, promo));
    },
  });

  // A quote for lines that have already changed must not be shown as the current one.
  const quote = active && settled && orderable.length > 0 ? query.data ?? null : null;

  return useMemo(() => {
    const addonPercent = new Map<string, number>();
    let units = 0;
    for (const l of quote?.lines ?? []) {
      if (l.percent > 0) addonPercent.set(bundleLineKey(l.productId, l.variantId), l.percent);
      units += l.units;
    }
    const next = quote?.terms?.enabled ? bundlePercent(quote.terms, units + 1) : 0;
    return {
      quote,
      loading: active && orderable.length > 0 && (!settled || query.isFetching),
      addonPercent,
      nextPercent: next > (quote?.bundlePercent ?? 0) || units === 0 ? next : 0,
    };
  }, [quote, orderable.length, settled, query.isFetching, active]);
}

/**
 * Discount of the promo code typed earlier (kept in the cart store) for the cart/drawer — a plain
 * preview, no reservation (the checkout reserves). 0 when there is no code or it is not valid.
 */
export function useCartPromoDiscount(subtotal: number): number {
  const code = useCart((s) => s.promoCode).trim();
  const debouncedSubtotal = useDebounced(subtotal, DEBOUNCE_MS);
  const { data } = useQuery({
    queryKey: ["promo-preview", code, debouncedSubtotal],
    enabled: code.length > 0 && debouncedSubtotal > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: () => api.previewPromo(code, debouncedSubtotal),
  });
  return data?.valid ? data.discountMinor : 0;
}
