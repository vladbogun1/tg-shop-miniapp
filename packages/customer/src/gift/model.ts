/**
 * Чистая модель подарка: что показывает плитка «до подарка ещё N ₴» на товаре и в корзине. Разметка и тексты у
 * Mini App и сайта свои, а выбор «какой уровень показать, достигнут ли, что самое редкое» — одинаковый.
 */
import { rarestCasePrize, type CaseItem, type GiftInfo, type GiftProgress, type GiftTierInfo } from "@shop/core/giftcase";

export interface GiftView {
  isCase: boolean;
  /** Уровень кейса, о котором говорим: достигнутый, иначе следующий, иначе первый. Для подарка-товара null. */
  shownTier: GiftTierInfo | null;
  /** Подарок уже заработан. */
  done: boolean;
  /** Самый редкий приз показанного уровня (для строки «Усередині, наприклад…»). */
  rarest: CaseItem | null;
}

/** null — показывать нечего: кейс без призов на показанном уровне / подарок-товар без товара. */
export function giftView(gift: GiftProgress | null): GiftView | null {
  if (!gift) return null;
  const isCase = gift.kind === "CASE";
  const shownTier = isCase ? (gift.tier ?? gift.next ?? gift.tiers[0] ?? null) : null;
  if (isCase ? !shownTier?.prizes.length : !gift.product) return null;
  return { isCase, shownTier, done: gift.reached, rarest: shownTier ? rarestCasePrize(shownTier.prizes) : null };
}

/** Подарок, который есть что показать: кейс с призами в наличии / подарок-товар с товаром; иначе null. */
export function showableGift(g: GiftInfo | null | undefined): GiftInfo | null {
  if (!g) return null;
  return g.kind === "CASE" ? (g.tiers?.some((t) => t.prizes.length) ? g : null) : g.product ? g : null;
}
