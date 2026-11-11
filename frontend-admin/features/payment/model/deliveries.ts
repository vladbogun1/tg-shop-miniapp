/**
 * Для каких доставок показывается способ оплаты (V98). Сервер хранит CSV; пусто = при любой доставке.
 * «Оплата при получении» (kind ON_DELIVERY) создаётся в настройках Новой Почты — здесь её только не теряем при сохранении.
 */
export type DeliveryKind = "WAREHOUSE" | "POSTOMAT" | "DOORS" | "PICKUP";

export const DELIVERY_KINDS: { value: DeliveryKind; label: string }[] = [
  { value: "WAREHOUSE", label: "Отделение НП" },
  { value: "POSTOMAT", label: "Почтомат НП" },
  { value: "DOORS", label: "Курьер НП" },
  { value: "PICKUP", label: "Самовывоз" },
];

export const ALL_DELIVERIES: DeliveryKind[] = DELIVERY_KINDS.map((d) => d.value);

export const KIND_ON_DELIVERY = "ON_DELIVERY";

function isDeliveryKind(x: string): x is DeliveryKind {
  return (ALL_DELIVERIES as string[]).includes(x);
}

/** CSV сервера → выбранные доставки в порядке списка; пусто — все. */
export function parseDeliveries(csv: string | null | undefined): DeliveryKind[] {
  const picked = (csv ?? "")
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(isDeliveryKind);
  return picked.length === 0 ? [...ALL_DELIVERIES] : ALL_DELIVERIES.filter((d) => picked.includes(d));
}

/** Выбранные → CSV для PUT; все четыре = "" (без ограничения). */
export function deliveriesCsv(list: DeliveryKind[]): string {
  return list.length >= ALL_DELIVERIES.length ? "" : ALL_DELIVERIES.filter((d) => list.includes(d)).join(",");
}

/** Переключить доставку; последнюю выбранную не снимаем — способ без доставок нигде не покажется. */
export function toggleDelivery(list: DeliveryKind[], d: DeliveryKind): DeliveryKind[] {
  const on = list.includes(d);
  if (on && list.length === 1) return list;
  return ALL_DELIVERIES.filter((x) => (x === d ? !on : list.includes(x)));
}
