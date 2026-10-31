"use client";

/**
 * Корзина сайта: общий стор из @shop/customer/cart/store + то, чем сайт отличается от Mini App.
 *
 * Своё имя в localStorage (`site-cart-v1`); та же модель строки: одна на товар+вариант, снимок цены и остаток на
 * момент добавления (количество зажато им). Снимок — только снимок: {@link useCartValidation} перечитывает каждую
 * строку с сервера и поправляет цену и остаток, ведь корзина в браузере может лежать неделями.
 * Состояние ящика корзины живёт здесь же, чтобы «В корзину» где угодно могло его открыть.
 *
 * Вошедшему покупателю тот же стор — локальная копия серверной корзины, общей с Mini App: действия синхронные и
 * оптимистичные, `lib/cart-sync.ts` пишет их на сервер (с задержкой) и перечитывает корзину при входе и возврате в окно.
 */
import { createCartStore } from "@shop/customer/cart/store";
import { stockOf } from "@shop/customer/catalog/model/stock";

export { lineKey, type CartLine } from "@shop/customer/cart/lines";

/**
 * Чья корзина лежит в сторе. `guest` — собственная корзина этого браузера (при входе вливается в аккаунт);
 * `server` — локальная копия серверной корзины вошедшего покупателя.
 */
export type CartOwner = "guest" | "server";

interface SiteCartExtra {
  drawerOpen: boolean;
  owner: CartOwner;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const cart = createCartStore<SiteCartExtra>({
  policy: {
    storageKey: "site-cart-v1",
    stockOf,
    imageUrlOf: (product) =>
      (product.images ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0]?.url ?? null,
    trackSlug: true,
    // строка без остатка остаётся (серым, оформление заблокировано), в сумму и промокод не входит
    keepSoldOut: true,
    counts: (l) => l.stock > 0,
  },
  extra: (set) => ({
    drawerOpen: false,
    owner: "guest",
    openDrawer: () => set({ drawerOpen: true }),
    closeDrawer: () => set({ drawerOpen: false }),
  }),
  persistExtra: (s) => ({ owner: s.owner }),
});

export const { useCart, useCartCount, useCartPromoItems, useCartSubtotal } = cart;
/** antibot.maxQtyPerProduct с сервера (lib/order-limits.ts). */
export const { setQtyCap } = cart;
