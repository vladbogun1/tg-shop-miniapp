import { describe, expect, it } from "vitest";
import { filtersKey, hasFilters, NO_FILTERS, toggleBlocked, toggleFlagged, toggleHasOrders, togglePremium } from "./filters";

describe("фильтры списка покупателей", () => {
  it("по умолчанию ничего не включено", () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
  });
  it("«С заказами» и «Без заказов» исключают друг друга, повторный клик снимает", () => {
    const withOrders = toggleHasOrders(NO_FILTERS, true);
    expect(withOrders.hasOrders).toBe(true);
    expect(toggleHasOrders(withOrders, false).hasOrders).toBe(false);
    expect(toggleHasOrders(withOrders, true).hasOrders).toBeUndefined();
  });
  it("фильтры комбинируются", () => {
    const f = toggleBlocked(togglePremium(toggleHasOrders(NO_FILTERS, true)));
    expect(f).toEqual({ blockedOnly: true, premiumOnly: true, flaggedOnly: false, hasOrders: true });
    expect(hasFilters(f)).toBe(true);
    expect(filtersKey(f)).toBe("bp-o");
    expect(filtersKey(toggleFlagged(f))).toBe("bpfo");
    expect(filtersKey(toggleHasOrders(NO_FILTERS, false))).toBe("---n");
  });
});
