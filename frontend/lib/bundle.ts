"use client";

/**
 * «Разом дешевше» (accessories with a discount next to a product).
 *
 * The rules live on the server (com.maxsolch.shop.bundle) and in `@shop/shared` (bundle.ts): one
 * discount per order — the bundle or the promo code, whichever is better. The cart and the checkout
 * ask the server (`quote`) so the total on screen is the one the order will be charged; the product
 * page prices its own block with `bundleDiscount`.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { bundleLineKey, bundleQuoteBody, type BundleQuote } from "@shop/shared";
import { useI18n } from "@/i18n/context";
import { customerApi } from "@/lib/api";
import type { CartLine } from "@/lib/cart";

/** Quantity taps in a row make one request, not one per tap. */
const QUOTE_DEBOUNCE_MS = 300;

/** Accessories offered on a product page (empty / disabled = nothing to show). */
export function useBundleOffer(productId: string) {
  const { locale } = useI18n();
  return useQuery({
    queryKey: ["bundle-offer", productId, locale],
    queryFn: () => customerApi.getBundleOffer(productId),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/**
 * The server's price of the cart: bundle vs promo, the add-on lines, suggestions.
 *
 * `quote` is the answer for exactly these lines and this promo discount (null while it is being
 * fetched or after an error — the caller then falls back to its own sum); `last` keeps the previous
 * answer for the parts that may lag a moment (suggestions) without blinking.
 */
export function useBundleQuote(lines: CartLine[], promoDiscountMinor: number) {
  const { locale } = useI18n();
  const key = useMemo(
    () =>
      lines
        .map((l) => `${bundleLineKey(l.productId, l.variantId)}x${l.quantity}`)
        .sort()
        .join("|") + `#${promoDiscountMinor}`,
    [lines, promoDiscountMinor],
  );
  // Key and body move together, so an answer is always cached under the key it was asked for.
  const [pending, setPending] = useState(() => ({ key, body: bundleQuoteBody(lines, promoDiscountMinor) }));
  useEffect(() => {
    const body = bundleQuoteBody(lines, promoDiscountMinor);
    const t = setTimeout(() => setPending({ key, body }), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures lines + promo
  }, [key]);
  const debounced = pending.key;

  const query = useQuery({
    queryKey: ["bundle-quote", debounced, locale],
    queryFn: () => customerApi.quoteBundle(pending.body),
    enabled: lines.length > 0,
    staleTime: 30_000,
    retry: 1,
    placeholderData: keepPreviousData,
  });

  const fresh = debounced === key && !query.isPlaceholderData && !query.isError;
  const quote: BundleQuote | null = fresh ? (query.data ?? null) : null;
  return { quote, last: query.data ?? null };
}

/**
 * Stable id for the control group (`bundleGroup`): the Telegram user id, else an id kept in this
 * browser — the same visitor stays in the same group on every product.
 */
export function bundleVisitorId(): string {
  try {
    const w = window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number } } } } };
    const id = w.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (id) return String(id);
    const k = "mx-bundle-id";
    let v = localStorage.getItem(k);
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return "";
  }
}

/** Bundle percent of a cart line in the quote (0 when the line is not an add-on or promo won). */
export function addonPercent(quote: BundleQuote | null, productId: string, variantId: string | null): number {
  if (!quote || quote.discountKind !== "BUNDLE") return 0;
  const k = bundleLineKey(productId, variantId);
  return quote.lines.find((l) => bundleLineKey(l.productId, l.variantId) === k && l.discountMinor > 0)?.percent ?? 0;
}
