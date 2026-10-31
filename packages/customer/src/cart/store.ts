"use client";

/**
 * Корзина покупателя: zustand-стор с сохранением в localStorage — локальная, оптимистичная копия серверной корзины
 * (`/api/me/cart`, см. sync.ts). Действия синхронные; запись на сервер и перечитывание делает sync.
 *
 * Одна реализация на Mini App и сайт. Различия приложений — в политике (`CartPolicy`) и «довесках» (`extra`):
 * они записаны там, где приложение создаёт свой стор (frontend/lib/cart.ts, site/lib/cart.ts), а не размазаны
 * по условиям. Количество зажимается остатком при add/setQty и серверным лимитом на товар (`setQtyCap`).
 */
import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { lineKey, type CartLine, type CartProduct, type CartVariant } from "./lines";

export interface CartPolicy {
  /** Ключ localStorage (не менять: под ним лежат корзины покупателей). */
  storageKey: string;
  /** Остаток для add(); Mini App и сайт считают остаток товара с вариантами по-разному. */
  stockOf(product: CartProduct, variant: CartVariant | null): number;
  /** Картинка строки. */
  imageUrlOf(product: CartProduct): string | null;
  /** Сохранять ли slug (сайту нужны ссылки на товар). */
  trackSlug: boolean;
  /** Строка с нулевым остатком остаётся в корзине (сайт показывает её как «нет в наличии»), а не удаляется. */
  keepSoldOut: boolean;
  /** Строка учитывается в сумме и промокоде (сайт: только то, что можно заказать). */
  counts(line: CartLine): boolean;
}

export interface CartBase {
  lines: CartLine[];
  /** Промокод, который ввёл покупатель (проверяется на сервере при оформлении). */
  promoCode: string;
  add(product: CartProduct, variant: CartVariant | null, qty?: number): void;
  setQty(key: string, qty: number): void;
  inc(key: string): void;
  dec(key: string): void;
  remove(key: string): void;
  clear(): void;
  setPromoCode(code: string): void;
  /** Заменить строки значениями с сервера (проверка корзины). */
  patchLines(patch: (lines: CartLine[]) => CartLine[]): void;
}

export type CartStore<X extends object> = UseBoundStore<StoreApi<CartBase & X>>;

export interface CartStoreOptions<X extends object> {
  policy: CartPolicy;
  /** Состояние и действия приложения сверх общих (Mini App: migrated; сайт: ящик корзины, owner). */
  extra: StateCreator<CartBase & X, [], [], X>;
  /** Что из «довесков» сохранять в localStorage. */
  persistExtra: (state: CartBase & X) => Partial<X>;
  /** Только для тестов: хранилище вместо localStorage. */
  storage?: StateStorage;
}

export function createCartStore<X extends object>(opts: CartStoreOptions<X>) {
  const { policy } = opts;
  /** antibot.maxQtyPerProduct с сервера; Infinity, пока не известно / 0 = выключено. */
  let qtyCap = Number.POSITIVE_INFINITY;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n, qtyCap));

  const useCart = create<CartBase & X>()(
    persist(
      (rawSet, get, api) => {
        // set() с типом только общей части: общие действия не знают о «довесках» приложения
        const set = rawSet as (patch: Partial<CartBase> | ((s: CartBase) => Partial<CartBase>)) => void;
        return {
          lines: [],
          promoCode: "",

          add: (product, variant, qty = 1) => {
            const variantId = variant?.id ?? null;
            const key = lineKey(product.id, variantId);
            const stock = policy.stockOf(product, variant);
            if (stock <= 0) return;
            const slug = product.slug ?? null;

            set((state) => {
              const existing = state.lines.find((l) => l.key === key);
              if (existing) {
                const patch = policy.trackSlug ? { slug: slug ?? existing.slug } : {};
                return {
                  lines: state.lines.map((l) =>
                    l.key === key ? { ...l, quantity: clamp(l.quantity + qty, 1, stock), stock, ...patch } : l,
                  ),
                };
              }
              const line: CartLine = {
                key,
                productId: product.id,
                ...(policy.trackSlug ? { slug } : {}),
                variantId,
                variantName: variant?.name ?? null,
                title: product.title,
                priceMinor: product.priceMinor,
                currency: product.currency ?? "UAH",
                imageUrl: policy.imageUrlOf(product),
                stock,
                quantity: clamp(qty, 1, stock),
              };
              return { lines: [...state.lines, line] };
            });
          },

          setQty: (key, qty) =>
            set((state) => ({
              lines: state.lines
                .map((l) => (l.key === key ? { ...l, quantity: clamp(qty, 0, policy.keepSoldOut ? Math.max(l.stock, 0) : l.stock) } : l))
                .filter((l) => l.quantity > 0 || (policy.keepSoldOut && l.stock <= 0)),
            })),

          inc: (key) => {
            const l = get().lines.find((x) => x.key === key);
            if (l) get().setQty(key, l.quantity + 1);
          },
          dec: (key) => {
            const l = get().lines.find((x) => x.key === key);
            if (l) get().setQty(key, l.quantity - 1);
          },
          remove: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),
          clear: () => set({ lines: [], promoCode: "" }),
          setPromoCode: (code) => set({ promoCode: code }),
          patchLines: (patch) => set((state) => ({ lines: patch(state.lines) })),

          ...opts.extra(rawSet, get, api),
        };
      },
      {
        name: policy.storageKey,
        ...(opts.storage ? { storage: createJSONStorage(() => opts.storage as StateStorage) } : {}),
        // сохраняем данные, не функции
        partialize: (s) => ({ lines: s.lines, promoCode: s.promoCode, ...opts.persistExtra(s) }) as unknown as CartBase & X,
      },
    ),
  );

  return {
    useCart,
    setQtyCap(n: number): void {
      qtyCap = n > 0 ? n : Number.POSITIVE_INFINITY;
    },
    /** Общее количество штук (перерисовывается при изменении). */
    useCartCount: (): number => useCart((s) => s.lines.reduce((sum, l) => sum + l.quantity, 0)),
    /**
     * Строки корзины для проверки промокода, `id*qty,…` (код из кейса считается без товаров с низкой маржой, как и
     * оформление). Строка — чтобы селектор был стабильным.
     */
    useCartPromoItems: (): string =>
      useCart((s) => s.lines.filter((l) => policy.counts(l) && l.quantity > 0).map((l) => `${l.productId}*${l.quantity}`).join(",")),
    /** Сумма в minor units (перерисовывается при изменении). */
    useCartSubtotal: (): number =>
      useCart((s) => s.lines.reduce((sum, l) => (policy.counts(l) ? sum + l.priceMinor * l.quantity : sum), 0)),
  };
}
