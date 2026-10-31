/**
 * Структурированные события: id лежат в `meta` (JSON), по ним строятся воронка и «смотрели, но не
 * купили» в админке. Контракт с бэкендом (StructuredEvents). Здесь — только форма события;
 * отправляет его `Analytics.track` приложения.
 */
export type TrackArgs = readonly [event: string, target: string | undefined, meta: string | undefined];

const withMeta = (event: string, meta: Record<string, unknown>): TrackArgs => [event, undefined, JSON.stringify(meta)];

/** Экран показан (смена маршрута) — только сайт. */
export const pageViewEvent = (): TrackArgs => ["view", undefined, undefined];

/** Открыта карточка товара. */
export const productViewEvent = (productId: string): TrackArgs => withMeta("product_view", { productId });

/** Строка добавлена в корзину (первое добавление с нуля, не каждый «+»). */
export const addToCartEvent = (productId: string, variantId: string | null, qty: number): TrackArgs =>
  withMeta("add_to_cart", { productId, variantId, qty });

/** Сравнение: compare_add (productId) / compare_open (сколько товаров в списке) — только сайт. */
export const compareEvent = (event: "compare_add" | "compare_open", productId?: string, count?: number): TrackArgs =>
  withMeta(event, { productId, count });

/** Открыт подарочный кейс заказа; `rarity` приза. */
export const giftCaseOpenEvent = (orderId: string, rarity: string): TrackArgs =>
  withMeta("gift_case_open", { orderId, rarity });

/** Открыто оформление с чем-то в корзине. */
export const checkoutStartEvent = (): TrackArgs => ["checkout_start", undefined, undefined];

/** Заказ создан. Приложение сразу сбрасывает буфер: после этого его часто закрывают. */
export const orderCreatedEvent = (orderId: string): TrackArgs => withMeta("order_created", { orderId });
