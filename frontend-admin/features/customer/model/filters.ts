/** Фильтры списка покупателей; все включённые работают вместе (И). */
export interface UserFilters {
  blockedOnly: boolean;
  premiumOnly: boolean;
  /** true — есть хотя бы один заказ (любого статуса), false — заказов нет, undefined — не важно. */
  hasOrders: boolean | undefined;
}

export const NO_FILTERS: UserFilters = { blockedOnly: false, premiumOnly: false, hasOrders: undefined };

export function hasFilters(f: UserFilters): boolean {
  return f.blockedOnly || f.premiumOnly || f.hasOrders !== undefined;
}

/** «С заказами» и «Без заказов» исключают друг друга: повторный клик по включённому снимает его. */
export function toggleHasOrders(f: UserFilters, value: boolean): UserFilters {
  return { ...f, hasOrders: f.hasOrders === value ? undefined : value };
}

export function togglePremium(f: UserFilters): UserFilters {
  return { ...f, premiumOnly: !f.premiumOnly };
}

export function toggleBlocked(f: UserFilters): UserFilters {
  return { ...f, blockedOnly: !f.blockedOnly };
}

/** Ключ для кэша и сброса анимации списка. */
export function filtersKey(f: UserFilters): string {
  return `${f.blockedOnly ? "b" : "-"}${f.premiumOnly ? "p" : "-"}${f.hasOrders === undefined ? "-" : f.hasOrders ? "o" : "n"}`;
}
