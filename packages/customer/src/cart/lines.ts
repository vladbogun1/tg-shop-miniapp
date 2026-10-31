/** Строка корзины и ключи — общая модель Mini App и сайта. Деньги в minor units. */

export interface CartLine {
  key: string;
  productId: string;
  variantId: string | null;
  variantName: string | null;
  title: string;
  priceMinor: number;
  currency: string;
  imageUrl: string | null;
  /** Остаток товара/варианта — количество зажато им при add/setQty. */
  stock: number;
  quantity: number;
  /** Для ссылки на страницу товара (только сайт; у строк до появления slug — нет). */
  slug?: string | null;
  /** Цена из снимка, если сервер потом назвал другую (только сайт, проставляет проверка корзины). */
  previousPriceMinor?: number | null;
}

/** Одна строка на товар+вариант. */
export function lineKey(productId: string, variantId?: string | null): string {
  return `${productId}::${variantId ?? ""}`;
}

/** То, что корзине нужно знать о товаре (витринный ProductDto и урезанная плитка сайта подходят оба). */
export interface CartProduct {
  id: string;
  title: string;
  priceMinor: number;
  currency?: string | null;
  stock?: number | null;
  slug?: string | null;
  images?: readonly { url?: string | null; sortOrder?: number | null }[] | null;
  variants?: readonly { stock?: number | null }[] | null;
}

export interface CartVariant {
  id?: string | null;
  name: string;
  stock: number;
}
