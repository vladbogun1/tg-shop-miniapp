import type { TrExportItem } from "./types";

/** Строка экспорта для тестов: по умолчанию переведённое, не проверенное поле товара. */
export function item(over: Partial<TrExportItem> & { entityId: string }): TrExportItem {
  return {
    entityType: "PRODUCT",
    field: "title",
    source: "Ковер Attack Shark черный",
    sourceHash: "a".repeat(64),
    status: "TRANSLATED",
    text: "Килимок Attack Shark чорний",
    origin: "AI",
    productId: "p1",
    productTitle: "Ковер",
    prevSource: null,
    reviewed: false,
    ...over,
  };
}
