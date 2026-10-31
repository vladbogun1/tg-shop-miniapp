"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setHolds, useMyPreorders } from "@/features/preorder";
import { type CartLine, lineKey, useCart } from "./store";

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
