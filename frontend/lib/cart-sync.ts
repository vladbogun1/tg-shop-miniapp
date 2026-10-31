"use client";

/**
 * Держит корзину Mini App в согласии с серверной корзиной покупателя — той же, что он видит на сайте, войдя тем же
 * Telegram-аккаунтом (docs/SITE-SPEC.md, «Серверная корзина»). Движок — @shop/customer/cart/sync; здесь только то,
 * что принадлежит Mini App:
 *
 * - до обмена initData на токен в `/api/me/**` не ходим (запросы, обогнавшие токен, получали 403): стор показывает
 *   сохранённую локальную копию;
 * - первый запуск после выхода серверной корзины (`migrated` не стоит): корзина, жившая только на устройстве,
 *   ВЛИВАЕТСЯ в серверную один раз (одна строка → большее количество), дальше правда — сервер; правки, сделанные до
 *   прихода токена, вливаются так же, ничего добавленного не теряется;
 * - строки, которые магазин сейчас продать не может (скрыты, нет в наличии), здесь НЕ показываются — в корзине Mini App
 *   нет состояния «недоступно», а оформление на них упало бы, — но уходят в каждой записи, чтобы остаться на сервере
 *   (сайт показывает их с пометкой) и вернуться, когда товар снова появится.
 */
import { createCartSync, type CartSyncPolicy } from "@shop/customer/cart/sync";
import { lineKey, type CartLine } from "@shop/customer/cart/lines";
import { customerApi, onAccessToken, getAccessToken } from "./api";
import { useCart } from "./cart";
import { telegramPlatform } from "./platform";

type State = ReturnType<typeof useCart.getState>;

const policy: CartSyncPolicy<State> = {
  fromServer(cart) {
    const visible: CartLine[] = [];
    const hidden: { productId: string; variantId: string | null; quantity: number }[] = [];
    const synced: typeof hidden = [];
    for (const s of cart.lines) {
      const input = { productId: s.productId, variantId: s.variantId, quantity: s.quantity };
      if (!s.available) {
        hidden.push(input);
        continue;
      }
      synced.push(input);
      visible.push({
        key: lineKey(s.productId, s.variantId),
        productId: s.productId,
        variantId: s.variantId,
        variantName: s.variantName,
        title: s.title,
        priceMinor: s.priceMinor,
        currency: s.currency,
        imageUrl: s.imageUrl,
        stock: s.stock,
        // Корзина везде зажата остатком; зажатое уходит назад на сервер.
        quantity: Math.max(1, Math.min(s.quantity, s.stock)),
      });
    }
    return { patch: { lines: visible }, hidden, synced };
  },
  shouldMergeLocal: (state, editedBeforeStart) => !state.migrated || editedBeforeStart,
  started: { migrated: true },
  wantStart: () => getAccessToken() !== null,
};

const sync = createCartSync({ store: useCart, api: customerApi.cart, platform: telegramPlatform, policy });

export const { flushCart, cartAfterOrder } = sync;

/** Запускает синхронизацию на всё время жизни приложения; возвращает отписку. Вызывается один раз из Providers. */
export function startCartSync(): () => void {
  const detach = sync.attach();
  // запросы к /api/me/** ждут токен; новый токен после перелогина перечитывает корзину
  const unsubscribeToken = onAccessToken((token) => {
    if (token) void sync.start();
  });
  if (getAccessToken()) void sync.start();
  return () => {
    detach();
    unsubscribeToken();
  };
}
