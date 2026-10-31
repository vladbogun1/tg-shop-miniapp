import type { Demand, ReleaseResult } from "./types";

/** Строки «Чего ждут» по товару (все варианты). */
export function demandRowsOfProduct(demand: Demand[] | undefined, productId: string): Demand[] {
  return (demand ?? []).filter((d) => d.productId === productId);
}

/** Сколько разных людей ждут эти строки: `productPeople` (без двойного счёта по вариантам) или сумма. */
export function peopleOfRows(rows: Demand[]): number {
  let sum = 0;
  let distinct: number | null = null;
  for (const d of rows) {
    sum += d.people;
    if (d.productPeople != null) distinct = Math.max(distinct ?? 0, d.productPeople);
  }
  return distinct ?? sum;
}

/** Ждущие по товару (все варианты): людей и штук. */
export function demandOfProduct(demand: Demand[] | undefined, productId: string): { people: number; units: number } | null {
  if (!demand) return null;
  const rows = demandRowsOfProduct(demand, productId);
  const units = rows.reduce((n, d) => n + d.units, 0);
  const people = peopleOfRows(rows);
  return people > 0 ? { people, units } : null;
}

/** Сумма результатов раздачи броней по нескольким строкам. */
export function sumReleases(results: ReleaseResult[]): ReleaseResult {
  const sum: ReleaseResult = { heldPeople: 0, heldQty: 0, shortPeople: 0, freeAfter: 0 };
  for (const res of results) {
    sum.heldPeople += res.heldPeople;
    sum.heldQty += res.heldQty;
    sum.shortPeople += res.shortPeople;
    sum.freeAfter += res.freeAfter;
  }
  return sum;
}

/** Сообщение о результате раздачи броней. */
export function releaseSummary(r: ReleaseResult): string {
  if (r.heldPeople === 0) return "Бронь никому не ушла: свободных штук нет";
  return `Бронь получили ${r.heldPeople} чел (${r.heldQty} шт)${r.shortPeople > 0 ? `, не хватило ${r.shortPeople} чел` : ""}`;
}
