"use client";

/**
 * Держит корзину сайта в согласии с серверной корзиной вошедшего покупателя — той же, что показывает Mini App
 * (docs/SITE-SPEC.md, «Серверная корзина»). Движок — @shop/customer/cart/sync; здесь то, что принадлежит сайту:
 *
 * - Гость: здесь ничего не происходит, корзина локальная (`site-cart-v1`).
 * - Вход: непустая гостевая корзина ВЛИВАЕТСЯ в корзину аккаунта (одна строка → большее количество), затем стор —
 *   локальная копия серверной (`owner: "server"`).
 * - Выход (или сессия кончилась): локальная копия ОЧИЩАЕТСЯ — корзина цела на сервере, а следующему человеку за общим
 *   компьютером её видеть не нужно.
 * - Строки сервера показываются все: недоступные — с остатком 0 (серым, оформление заблокировано); остаток поднимается
 *   на удержанное под предзаказ (`holdFloor`); сменившаяся цена запоминается в `previousPriceMinor`.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { createCartSync, type CartSyncPolicy } from "@shop/customer/cart/sync";
import { lineKey, type CartLine } from "@shop/customer/cart/lines";
import type { ServerCartLine } from "@shop/core/cart";
import { api, isAuthFailure } from "./api";
import { useCart } from "./cart";
import { webPlatform } from "./platform";
import { holdFloor } from "./preorder-core";
import { SESSION_KEY, useSession } from "./session";

type State = ReturnType<typeof useCart.getState>;

/** Сессия говорит «вошёл»: серверный режим должен быть включён (повтор по фокусу, если старт не удался). */
let wantServer = false;
let onAuthLost: (() => void) | null = null;

function toLine(s: ServerCartLine, prev: CartLine | undefined): CartLine {
  const priceChanged = !!prev && prev.priceMinor !== s.priceMinor;
  return {
    key: lineKey(s.productId, s.variantId),
    productId: s.productId,
    slug: s.slug,
    variantId: s.variantId,
    variantName: s.variantName,
    title: s.title,
    priceMinor: s.priceMinor,
    currency: s.currency,
    imageUrl: s.imageUrl,
    // Интерфейс уже считает остаток 0 «заказать нельзя» (серым, оформление заблокировано).
    stock: holdFloor(s.productId, s.variantId, s.available ? s.stock : 0),
    quantity: s.quantity,
    previousPriceMinor: priceChanged ? prev!.priceMinor : (prev?.previousPriceMinor ?? null),
  };
}

const policy: CartSyncPolicy<State> = {
  fromServer(cart, prevLines) {
    const prev = new Map(prevLines.map((l) => [l.key, l]));
    const lines = cart.lines.map((s) => toLine(s, prev.get(lineKey(s.productId, s.variantId))));
    const synced = lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity }));
    return { patch: { lines, owner: "server" }, hidden: [], synced };
  },
  shouldMergeLocal: (state) => state.owner !== "server",
  wantStart: () => wantServer,
  onError(e) {
    if (isAuthFailure(e)) onAuthLost?.();
    // Остальное (нет сети, 5xx): изменение остаётся локальным и уйдёт со следующим или по фокусу.
  },
};

const sync = createCartSync({ store: useCart, api: api.cart, platform: webPlatform, policy });

export const { flushCart, cartAfterOrder } = sync;

/** Монтируется один раз в Providers. */
export function CartSync(): null {
  const { status, confirmedGuest } = useSession();
  const qc = useQueryClient();

  useEffect(() => {
    onAuthLost = () => void qc.invalidateQueries({ queryKey: SESSION_KEY });
    return () => {
      onAuthLost = null;
    };
  }, [qc]);

  useEffect(() => {
    wantServer = status === "authed";
    if (status === "authed") {
      if (!sync.isActive()) void sync.start();
    } else if (confirmedGuest && (sync.isActive() || useCart.getState().owner === "server")) {
      // Только подтверждённое «не вошёл» — недоступный бэкенд не должен стирать корзину.
      sync.stop({ lines: [], promoCode: "", owner: "guest" });
    }
  }, [status, confirmedGuest]);

  useEffect(() => sync.attach(), []);

  return null;
}
