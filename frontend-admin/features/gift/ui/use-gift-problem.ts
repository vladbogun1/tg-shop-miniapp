"use client";

import { useProductsByIds } from "@/features/product";
import { giftWarnings, hasGiftProblem } from "../model/gift-warnings";

/** Подарок не выдастся (нет на складе, скрыт, не выбран) — для значка «!» в строке-сводке. */
export function useGiftProblem(productId: string, on: boolean, isCase: boolean): boolean {
  const productsQ = useProductsByIds(productId ? [productId] : []);
  const product = productId ? (productsQ.data?.find((p) => p.id === productId) ?? null) : null;
  return hasGiftProblem(giftWarnings({ product, productId, on, isCase }));
}
