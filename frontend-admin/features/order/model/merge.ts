/** «Объединить заказы»: чистые правила карточки слияния (какой заказ обязан остаться, что получится). */

/** The side of a pair that has to stay: a sealed case or a ТТН does not move to another order. */
export function mustStay(o: { trackingNumber?: string | null; giftCaseStatus?: string | null }): string | null {
  if (o.giftCaseStatus === "SEALED") return "в нём не открыт кейс";
  if (o.trackingNumber) return "у него уже есть ТТН";
  return null;
}

/** What the order that stays looks like after the merge (same rules as the server). */
export function mergePreview(total: number, received: number, prepayment: number) {
  const dueOnline = prepayment > 0 ? Math.min(prepayment, total) : total;
  const due = Math.max(0, dueOnline - received);
  return { total, received, due, cod: Math.max(0, total - received - due) };
}

export function mergeAddress(o: { customerName?: string | null; npCityName?: string | null; npWarehouseName?: string | null }): string {
  return [o.customerName, o.npCityName, o.npWarehouseName].filter(Boolean).join(", ");
}

/** Which side stays by default: the older order, unless one side has to. */
export function defaultKeepThis(
  thisOrder: { createdAt: string; trackingNumber?: string | null; giftCaseStatus?: string | null },
  other: { createdAt: string; trackingNumber?: string | null; giftCaseStatus?: string | null },
): boolean {
  const thisOlder = new Date(thisOrder.createdAt).getTime() <= new Date(other.createdAt).getTime();
  return mustStay(other) ? false : mustStay(thisOrder) ? true : thisOlder;
}

interface MergeSide {
  totalMinor: number;
  receivedMinor?: number | null;
  prepaymentMinor?: number | null;
  trackingNumber?: string | null;
  giftCaseStatus?: string | null;
  customerName?: string | null;
  npCityName?: string | null;
  npWarehouseName?: string | null;
}

/** The picked pair seen from the card: who stays, whether the address differs, the result, can it go. */
export function mergeView<A extends MergeSide, B extends MergeSide & { blocker?: string | null }>(
  order: A,
  other: B | null,
  keepThis: boolean,
) {
  if (!other) return { target: null, source: null, sameAddress: false, result: null, ready: false };
  const target: A | B = keepThis ? order : other;
  const source: A | B = keepThis ? other : order;
  const result = mergePreview(
    order.totalMinor + other.totalMinor,
    (order.receivedMinor ?? 0) + (other.receivedMinor ?? 0),
    (keepThis ? order.prepaymentMinor : other.prepaymentMinor) ?? 0,
  );
  const stayBlock = keepThis ? mustStay(other) : mustStay(order);
  return {
    target,
    source,
    sameAddress: mergeAddress(order) === mergeAddress(other),
    result,
    ready: !other.blocker && !stayBlock,
  };
}
