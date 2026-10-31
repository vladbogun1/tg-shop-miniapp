"use client";

/**
 * Синхронизация локальной корзины с серверной (`/api/me/cart`, одна на аккаунт — её видят и Mini App, и сайт).
 * Один движок на оба приложения; чем они отличаются — в `CartSyncPolicy` и `Platform`.
 *
 * - Каждое изменение применяется локально сразу и пишется `PUT` через 400 мс после последнего. Ответ принимается,
 *   только если за это время локально ничего не менялось.
 * - Старт: непустая локальная корзина ВЛИВАЕТСЯ в серверную (одна строка → большее количество), потом правда — сервер.
 * - Приложение вернулось на передний план → перечитать корзину (другое устройство могло её изменить); уход в фон
 *   отправляет отложенную запись с `keepalive`.
 * - После заказа сервер уже убрал заказанные строки в той же транзакции: локально они уходят без записи
 *   (запись только поссорилась бы с другим устройством), потом корзина перечитывается.
 *
 * Состояние — в замыкании движка, а не в React: корзина одна на вкладку, а оформлению нужен `flushCart()` без
 * протаскивания через props.
 */
import { cartSignature, type CartLineInput, type ServerCart } from "@shop/core/cart";
import { nowMs } from "@shop/core/time";
import type { Platform } from "../platform/platform";
import type { CartApi } from "./api";
import type { CartLine } from "./lines";

const WRITE_DEBOUNCE_MS = 400;
/** `focus` и `visibilitychange` обычно приходят вместе; одного перечитывания достаточно. */
const REFRESH_GAP_MS = 2_000;

/** Что движку нужно от стора корзины (подходит любой `useCart` из `createCartStore`). */
export interface CartStoreLike<S extends { lines: CartLine[]; promoCode: string }> {
  getState(): S;
  setState(patch: Partial<S>): void;
  subscribe(listener: (state: S, prev: S) => void): () => void;
}

export interface CartFromServer<S> {
  /** Что записать в стор (обязательно `lines`; плюс приложение может поставить свои поля). */
  patch: Partial<S> & { lines: CartLine[] };
  /** Строки сервера, которых приложение не показывает (нельзя продать), — они уходят назад с каждой записью. */
  hidden: CartLineInput[];
  /** Какие строки теперь заведомо есть на сервере (по ним считается «изменилось ли что-то локально»). */
  synced: CartLineInput[];
}

/** Различия Mini App и сайта в том, как корзина сервера становится локальной. */
export interface CartSyncPolicy<S extends { lines: CartLine[]; promoCode: string }> {
  fromServer(cart: ServerCart, prev: CartLine[]): CartFromServer<S>;
  /** На старте влить локальные строки в серверную корзину, а не перезаписать ими. */
  shouldMergeLocal(state: S, editedBeforeStart: boolean): boolean;
  /** Что записать в стор после успешного старта (Mini App: `migrated: true`). */
  started?: Partial<S>;
  /** Пора запускать синхронизацию, если она ещё не запущена (Mini App: токен есть; сайт: сессия «вошёл»). */
  wantStart(): boolean;
  /** Ошибка запроса; по умолчанию молчим — изменение остаётся локальным и уйдёт со следующим или при возврате. */
  onError?(e: unknown): void;
}

export interface CartSyncOptions<S extends { lines: CartLine[]; promoCode: string }> {
  store: CartStoreLike<S>;
  api: CartApi;
  platform: Platform;
  policy: CartSyncPolicy<S>;
}

export function createCartSync<S extends { lines: CartLine[]; promoCode: string }>(opts: CartSyncOptions<S>) {
  const { store, api, platform, policy } = opts;

  let active = false;
  let starting: Promise<void> | null = null;
  /** Подпись строк, которые заведомо лежат на сервере. */
  let syncedSig: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  /** Пока стор пишется из ответа сервера — чтобы запись не отразилась обратно. */
  let applying = false;
  /** Покупатель менял корзину до старта синхронизации (токена ещё не было). */
  let editedBeforeStart = false;
  let hidden: CartLineInput[] = [];
  let lastRefresh = 0;

  const inputs = (lines: CartLine[]): CartLineInput[] =>
    lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity }));
  const localSig = () => cartSignature(inputs(store.getState().lines));
  const payload = () => [...inputs(store.getState().lines), ...hidden];

  function setLocal(patch: Partial<S>): void {
    applying = true;
    try {
      store.setState(patch);
    } finally {
      applying = false;
    }
  }

  function adopt(cart: ServerCart): void {
    const r = policy.fromServer(cart, store.getState().lines);
    hidden = r.hidden;
    syncedSig = cartSignature(r.synced);
    setLocal(r.patch as Partial<S>);
    // Корзина зажата остатком — зажатое уходит назад на сервер.
    if (cartSignature(inputs(r.patch.lines)) !== syncedSig) schedule();
  }

  async function push(): Promise<void> {
    timer = null;
    if (!active || !platform.canCallApi()) return;
    if (inflight) {
      await inflight;
      return push();
    }
    const sig = localSig();
    if (sig === syncedSig) return;
    const run = (async () => {
      try {
        const cart = await api.put(payload());
        if (localSig() === sig) adopt(cart);
        else syncedSig = sig; // более новые правки уже запланированы
      } catch (e) {
        policy.onError?.(e);
      }
    })();
    inflight = run;
    try {
      await run;
    } finally {
      inflight = null;
    }
  }

  function schedule(): void {
    if (!active) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void push(), WRITE_DEBOUNCE_MS);
  }

  /** Отправляет отложенную запись сейчас и ждёт её (оформление заказа вызывает это перед созданием заказа). */
  async function flushCart(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      await push();
    } else if (inflight) {
      await inflight;
    }
  }

  async function refresh(force = false): Promise<void> {
    if (!active || !platform.canCallApi()) return;
    const now = nowMs();
    if (!force && now - lastRefresh < REFRESH_GAP_MS) return;
    lastRefresh = now;
    await flushCart();
    try {
      const before = localSig();
      const cart = await api.get();
      if (localSig() === before && !timer && !inflight) adopt(cart);
    } catch (e) {
      policy.onError?.(e);
    }
  }

  /** Запускает синхронизацию; уже запущена — просто перечитывает корзину (новый токен после перелогина). */
  function start(): Promise<void> {
    if (active) return refresh(true);
    if (!starting) {
      starting = (async () => {
        try {
          const st = store.getState();
          const merge = policy.shouldMergeLocal(st, editedBeforeStart) && st.lines.length > 0;
          const cart = merge ? await api.merge(inputs(st.lines)) : await api.get();
          editedBeforeStart = false;
          active = true;
          lastRefresh = nowMs();
          if (policy.started) setLocal(policy.started);
          adopt(cart);
        } catch (e) {
          policy.onError?.(e); // повторится со следующим токеном / при возврате в приложение
        } finally {
          starting = null;
        }
      })();
    }
    return starting;
  }

  /** Выход из аккаунта: синхронизация выключена, локальная копия сброшена `reset`-ом приложения. */
  function stop(reset: Partial<S>): void {
    active = false;
    if (timer) clearTimeout(timer);
    timer = null;
    syncedSig = null;
    hidden = [];
    setLocal(reset);
  }

  /** После успешного заказа: заказанные строки уходят локально без записи, затем корзина перечитывается. */
  function cartAfterOrder(orderedKeys: string[]): void {
    if (timer) clearTimeout(timer);
    timer = null;
    const gone = new Set(orderedKeys);
    const lines = store.getState().lines.filter((l) => !gone.has(l.key));
    setLocal({ lines, promoCode: "" } as Partial<S>);
    if (active) {
      syncedSig = cartSignature(inputs(lines));
      void refresh(true);
    }
  }

  function wake(): void {
    if (!active && policy.wantStart()) void start();
    else void refresh();
  }

  function hide(): void {
    if (!active || !timer) return;
    clearTimeout(timer);
    timer = null;
    platform.putCartOnUnload(payload());
    syncedSig = localSig();
  }

  /** Подписывает движок на стор и жизненный цикл платформы на всё время жизни приложения; возвращает отписку. */
  function attach(): () => void {
    const unsubscribeStore = store.subscribe((state, prev) => {
      if (applying || state.lines === prev.lines) return;
      if (!active) {
        editedBeforeStart = true;
        return;
      }
      if (cartSignature(inputs(state.lines)) !== syncedSig) schedule();
    });
    const offForeground = platform.onForeground(wake);
    const offBackground = platform.onBackground(hide);
    return () => {
      unsubscribeStore();
      offForeground();
      offBackground();
    };
  }

  return { attach, start, stop, flushCart, cartAfterOrder, isActive: () => active };
}

export type CartSync = ReturnType<typeof createCartSync>;
