/** details (JSON-текст события) -> пары «подпись — значение» для админа. */
import { money } from "@/lib/money";

const DETAIL_LABEL: Record<string, string> = {
  totalMinor: "Сумма",
  discountMinor: "Скидка",
  amountMinor: "Сумма",
  refundMinor: "Возврат",
  refundedTotalMinor: "Возвращено всего",
  subtotalMinor: "Корзина",
  theirAmount: "Сумма monobank",
  theirCcy: "Валюта monobank",
  promoCode: "Промокод",
  code: "Промокод",
  items: "Позиций",
  payment: "Способ оплаты",
  delivery: "Доставка",
  invoice: "Счёт monobank",
  returnTo: "Откуда",
  display: "Вид",
  expiresAt: "Действует до",
  method: "Способ",
  system: "Платёжная система",
  kind: "Вид",
  file: "Файл",
  lang: "Язык",
  language: "Язык Telegram",
  premium: "Premium",
  from: "Было",
  to: "Стало",
  rating: "Оценка",
  status: "Статус",
  reviewId: "Отзыв №",
  bonusPercent: "Бонус, %",
  percent: "Скидка, %",
  thread: "Обращение",
  tag: "Тег",
  category: "Категория",
  brand: "Бренд",
  condition: "Состояние",
  conditionNote: "Причина уценки",
  cardStatus: "Статус карточки",
  specs: "Характеристики",
  key: "Ключ",
  merged: "Объединено",
  into: "В",
  sent: "Доставлено",
  failed: "Ошибок",
  removed: "Удалено устройств",
};

export function detailPairs(json?: string | null): [string, string][] {
  if (!json) return [];
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(obj).map(([k, v]) => {
      let value = typeof v === "object" ? JSON.stringify(v) : String(v);
      if (k.endsWith("Minor") || k === "theirAmount") {
        const n = Number(v);
        if (!isNaN(n)) value = money(n);
      }
      if (v === true) value = "да";
      return [DETAIL_LABEL[k] ?? k, value];
    });
  } catch {
    return [];
  }
}
