"use client";

/**
 * Pre-orders in the browser: calls (same-origin cookie session, refresh-once on 401/403 — the same HTTP
 * client as lib/support.ts), hooks, and «my hold = my stock» for the cart. Shapes and wording are in
 * lib/preorder-core.ts.
 *
 * The public catalog's `stock` is already «stock minus every hold», so a customer whose place is HELD
 * sees 0 there — {@link holdFloor} gives that stock back to its owner (the order itself is checked on
 * the server against «stock minus holds of OTHER people»).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { createHttpClient } from "@shop/core/http";
import { createPreorderApi } from "@shop/customer/preorder/api";
import { preorderKeys } from "@shop/customer/preorder/keys";
import { getActiveLocale, getActiveTag } from "@shop/core/i18n";
import { makeT } from "@/i18n";
import { ApiError, isAuthFailure, refreshSession } from "./api";
import { type CartLine, lineKey, useCart } from "./cart";
import { type MyPreorder, type ProductPreorder, setHolds } from "./preorder-core";
import { useSession } from "./session";

export * from "./preorder-core";

// ---------------------------------------------------------------- browser calls

const http = createHttpClient({
  baseUrl: "",
  getToken: () => null,
  credentials: "include",
  getLocale: getActiveTag,
  messages: {
    offline: () => makeT(getActiveLocale())("common.offline"),
    unauthorized: () => makeT(getActiveLocale())("common.sessionExpired"),
    http: (status) => makeT(getActiveLocale())("common.httpError", { status }),
  },
});

async function authed<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (!isAuthFailure(e)) throw e;
    await refreshSession();
    return call();
  }
}

export const preorderApi = createPreorderApi(http, authed);

export { ApiError };

/** Backend refusal codes of a subscription (400 + `code`). */
export function preorderErrorCode(e: unknown): "IN_STOCK" | "TOO_MANY" | null {
  const code = e instanceof ApiError ? e.code : undefined;
  return code === "IN_STOCK" || code === "TOO_MANY" ? code : null;
}

export const MY_PREORDERS_KEY = ["preorders", "mine"] as const;
export const productPreorderKey = (productId: string) => ["preorders", "product", productId] as const;

/** My places (signed in only; a guest gets an empty list without a request). */
export function useMyPreorders(enabled = true) {
  const { status } = useSession();
  const on = enabled && status === "authed";
  const q = useQuery({
    queryKey: MY_PREORDERS_KEY,
    enabled: on,
    staleTime: 30_000,
    queryFn: () => preorderApi.mine(),
  });
  return { ...q, data: on ? q.data ?? [] : [], authed: status === "authed", sessionStatus: status };
}

/** Product block: the server-rendered public data first, then «mine» once the session is known. */
export function useProductPreorder(initial: ProductPreorder | null, productId: string) {
  const { status } = useSession();
  const q = useQuery({
    queryKey: productPreorderKey(productId),
    enabled: status === "authed",
    staleTime: 15_000,
    queryFn: () => preorderApi.forProduct(productId),
  });
  const data = status === "authed" && q.data ? q.data : initial;
  return { data, status };
}

// ---------------------------------------------------------------- «my hold = my stock» in the cart

/**
 * Mounted once (Providers): reads my places when signed in, remembers the held units and lifts the
 * stock of the cart lines they belong to — otherwise the catalog's «0 in stock» would block the very
 * purchase the customer was promised.
 */
export function PreorderHoldsSync() {
  const { data } = useMyPreorders();
  const patchLines = useCart((s) => s.patchLines);
  const qc = useQueryClient();
  const sig = data
    .filter((m) => m.status === "HELD" && m.heldQty > 0)
    .map((m) => `${lineKey(m.productId, m.variantId)}=${m.heldQty}`)
    .join(",");
  useEffect(() => {
    const next = new Map<string, number>();
    for (const part of sig ? sig.split(",") : []) {
      const [k, n] = part.split("=");
      next.set(k, Number(n));
    }
    setHolds(next);
    if (next.size === 0) return;
    patchLines((lines: CartLine[]) =>
      lines.map((l) => {
        const h = next.get(l.key) ?? 0;
        return h > l.stock ? { ...l, stock: h } : l;
      })
    );
  }, [sig, patchLines, qc]);
  return null;
}
