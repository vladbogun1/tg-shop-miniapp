"use client";

/**
 * Корзина Mini App: общий стор из @shop/customer/cart/store + то, чем Mini App отличается от сайта.
 *
 * Локальная, оптимистичная копия серверной корзины (её же видит сайт при входе тем же Telegram-аккаунтом):
 * действия синхронные, `lib/cart-sync.ts` пишет изменения на сервер и перечитывает корзину при возврате в приложение.
 * Строки — по ключу `${productId}::${variantId ?? ""}`; количество зажато остатком (деньги — minor units).
 */
import { createCartStore } from "@shop/customer/cart/store";

export { lineKey, type CartLine } from "@shop/customer/cart/lines";

interface MiniAppCartExtra {
  /**
   * Корзина, жившая только на этом устройстве (до серверной), влита в серверную. Пока нет — локальные строки
   * принадлежат покупателю и перезаписывать их нельзя.
   */
  migrated: boolean;
}

const cart = createCartStore<MiniAppCartExtra>({
  policy: {
    storageKey: "tgshop-cart-v1",
    // Остаток товара с вариантами без выбранного варианта — собственный (у такого товара он 0): Mini App всегда
    // кладёт в корзину либо товар без вариантов, либо конкретный вариант.
    stockOf: (product, variant) => (variant ? variant.stock : (product.stock ?? 0)),
    imageUrlOf: (product) => product.images?.[0]?.url ?? null,
    trackSlug: false,
    keepSoldOut: false,
    counts: () => true,
  },
  extra: () => ({ migrated: false }),
  persistExtra: (s) => ({ migrated: s.migrated }),
});

export const { useCart, useCartCount, useCartPromoItems, useCartSubtotal } = cart;
/** antibot.maxQtyPerProduct с сервера (lib/order-limits.ts). */
export const { setQtyCap } = cart;
