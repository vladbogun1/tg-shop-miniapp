/**
 * Платформа покупателя (docs/ARCHITECTURE-FRONT.md, 2.3): всё, чем Mini App (Telegram) отличается от сайта и что
 * нужно общим фичам. Реализации: `telegramPlatform` (frontend/platform/telegram/platform.ts), `webPlatform` (site/lib/platform.ts).
 *
 * Сюда попадает только то, что реально понадобилось фичам: корзина (доступ к `/api/me/**`, жизненный цикл страницы,
 * последняя запись корзины при сворачивании) и оформление заказа (`haptic`). Открытие ссылок и «Назад» добавятся,
 * когда их начнёт звать общий хук.
 */
import type { CartLineInput } from "@shop/core/cart";

export interface Platform {
  readonly kind: "telegram" | "web";
  /**
   * Можно ли сейчас ходить в `/api/me/**`. Mini App: до обмена initData на токен — нет (запросы получали 403);
   * сайт: всегда да, сессия в HttpOnly-cookie, а 401 разбирает сам вызов.
   */
  canCallApi(): boolean;
  /** Приложение снова на виду (Mini App — вкладка видима; сайт — окно в фокусе или вкладка видима). Возвращает отписку. */
  onForeground(cb: () => void): () => void;
  /** Приложение уходит в фон / закрывается. Возвращает отписку. */
  onBackground(cb: () => void): () => void;
  /** Последняя запись корзины, пока страница не закрылась: `keepalive`, «выстрелил и забыл». */
  putCartOnUnload(lines: CartLineInput[]): void;
  /** Лёгкий отклик на успешное действие. Mini App — хаптика Telegram, сайт — ничего. */
  haptic(): void;
}
