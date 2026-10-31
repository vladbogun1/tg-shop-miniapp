import type { AdminProduct } from "./types";

/** Минимальный товар для тестов: только то, что читает модель. */
export function product(over: Partial<AdminProduct> = {}): AdminProduct {
  return { id: "p1", title: "Мышь", priceMinor: 10000, stock: 5, active: true, ...over } as AdminProduct;
}
