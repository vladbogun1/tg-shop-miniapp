/** Ручной заказ (продажа вне сайта): строки, правила готовности формы, тело запроса. Без React. */
import type { MovementChannel } from "@/features/payment";
import type { Product, ProductVariant } from "@shop/core/types";
import { toMinor } from "@/lib/money";
import type { AdminCreateOrderBody } from "../api";

export type Delivery = "NOVA_POSHTA" | "PICKUP";
export type PaidChannel = Extract<MovementChannel, "CARD_TRANSFER" | "CASH" | "NP_COD" | "MONO" | "OTHER">;

export const DELIVERY_OPTIONS: { value: Delivery; label: string }[] = [
  { value: "NOVA_POSHTA", label: "Нова пошта" },
  { value: "PICKUP", label: "Самовывоз" },
];

export const CHANNEL_OPTIONS: { value: PaidChannel; label: string }[] = [
  { value: "CARD_TRANSFER", label: "Перевод на карту" },
  { value: "CASH", label: "Наличные" },
  { value: "NP_COD", label: "Наложка НП" },
  { value: "MONO", label: "monobank" },
  { value: "OTHER", label: "Другое" },
];

export interface OrderLine {
  key: string;
  product: Product;
  variant: ProductVariant | null;
  qtyText: string;
}

export const qtyOf = (l: OrderLine) => Math.max(0, parseInt(l.qtyText, 10) || 0);

/** Поля формы ручного заказа (строки товаров — отдельно, это выбор из поиска, а не поле). */
export interface NewOrderValues {
  name: string;
  phone: string;
  comment: string;
  promo: string;
  delivery: Delivery;
  city: string;
  warehouse: string;
  paymentId: string;
  paidText: string;
  channel: PaidChannel;
  channelTouched: boolean;
  note: string;
  tgId: string;
}

export const EMPTY_NEW_ORDER: NewOrderValues = {
  name: "",
  phone: "",
  comment: "",
  promo: "",
  delivery: "NOVA_POSHTA",
  city: "",
  warehouse: "",
  paymentId: "",
  paidText: "",
  channel: "CARD_TRANSFER",
  channelTouched: false,
  note: "",
  tgId: "",
};

/** Канал по умолчанию: самовывоз платят наличными. */
export function defaultChannel(d: Delivery): PaidChannel {
  return d === "PICKUP" ? "CASH" : "CARD_TRANSFER";
}

/** Добавить товар: та же строка — +1, новая — в конец. */
export function addOrderLine(cur: OrderLine[], product: Product, variant: ProductVariant | null): OrderLine[] {
  const key = `${product.id}:${variant?.id ?? ""}`;
  return cur.some((l) => l.key === key)
    ? cur.map((l) => (l.key === key ? { ...l, qtyText: String(qtyOf(l) + 1) } : l))
    : [...cur, { key, product, variant, qtyText: "1" }];
}

export function paidMinorOf(v: NewOrderValues): number {
  return v.paidText.trim() ? toMinor(v.paidText) : 0;
}

export function isTgIdValid(tgId: string): boolean {
  return !tgId.trim() || /^\d{1,18}$/.test(tgId.trim());
}

export function canSubmitOrder(lines: OrderLine[], v: NewOrderValues): boolean {
  return (
    lines.length > 0 &&
    lines.every((l) => qtyOf(l) >= 1) &&
    v.name.trim().length > 0 &&
    v.phone.trim().length > 0 &&
    !!v.paymentId &&
    isTgIdValid(v.tgId) &&
    paidMinorOf(v) >= 0
  );
}

export function isOrderDirty(lines: OrderLine[], v: NewOrderValues): boolean {
  return lines.length > 0 || !!v.name || !!v.phone || !!v.comment || !!v.promo || !!v.note;
}

export function buildCreateBody(lines: OrderLine[], v: NewOrderValues): AdminCreateOrderBody {
  const nova = v.delivery === "NOVA_POSHTA";
  return {
    items: lines.map((l) => ({ productId: l.product.id, variantId: l.variant?.id ?? null, quantity: qtyOf(l) })),
    customerName: v.name.trim(),
    phone: v.phone.trim(),
    comment: v.comment.trim() || undefined,
    promoCode: v.promo.trim() || undefined,
    deliveryMethod: v.delivery,
    npCityName: nova && v.city.trim() ? v.city.trim() : undefined,
    npWarehouseName: nova && v.warehouse.trim() ? v.warehouse.trim() : undefined,
    paymentOptionId: v.paymentId,
    tgUserId: v.tgId.trim() ? Number(v.tgId.trim()) : undefined,
    paidMinor: paidMinorOf(v),
    paidChannel: v.channel,
    note: v.note.trim() || undefined,
  };
}

/** Товары, подходящие под поиск (до 8, без архивных). */
export function searchProducts(products: Product[], q: string): Product[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return products.filter((p) => !p.archived && p.title.toLowerCase().includes(s)).slice(0, 8);
}
