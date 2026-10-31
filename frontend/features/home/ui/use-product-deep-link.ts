"use client";

import { useCallback, useEffect } from "react";
import { sessionStore } from "@shop/core/storage";
import type { Product } from "@/lib/api";

/** Deep link from the bot: /?product=<id> opens that product (once the catalog is there). */
export function useProductDeepLink(products: Product[], open: (p: Product) => void): void {
  const openFromUrl = useCallback(() => {
    let handed: string | null = null;
    try {
      handed = sessionStore.getItem("shop:open-product");
    } catch {
      /* storage blocked */
    }
    const id = new URLSearchParams(window.location.search).get("product") ?? handed;
    if (!id || products.length === 0) return;
    const p = products.find((x) => x.id === id);
    if (p) open(p);
    try {
      sessionStore.removeItem("shop:open-product");
    } catch {
      /* storage blocked */
    }
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  }, [products, open]);
  useEffect(() => {
    openFromUrl();
    // the bot link can arrive after the catalog is already on screen (Providers pushes /?product=)
    const on = () => window.setTimeout(openFromUrl, 0);
    window.addEventListener("shop:product-link", on);
    return () => window.removeEventListener("shop:product-link", on);
  }, [openFromUrl]);
}
