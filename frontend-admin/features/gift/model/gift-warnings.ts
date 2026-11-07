/** Предупреждения про товар-подарок (поле «Товар-подарок» и «!» в строке-сводке). Тексты — из прежнего поля. */
import { productStock } from "@/lib/stock";
import type { Product } from "@shop/core/types";

export interface GiftWarning {
  /** warn — подарок не выдастся; info — пояснение. */
  tone: "warn" | "info";
  text: string;
}

type ProductLike = Pick<Product, "stock" | "variants"> & { archived?: boolean; active?: boolean };

function stockWarnings(product: ProductLike | null, on: boolean): GiftWarning[] {
  const out: GiftWarning[] = [];
  if (product && on && productStock(product) <= 0) {
    out.push({ tone: "warn", text: "Подарка нет на складе — покупатели его не увидят, пока не появится." });
  }
  if (product && (product.archived || product.active === false)) {
    out.push({ tone: "warn", text: "Товар скрыт из каталога — проверьте, что это нужный товар." });
  }
  const variants = product?.variants ?? [];
  const best = variants.length ? [...variants].sort((x, y) => (y.stock ?? 0) - (x.stock ?? 0))[0] : null;
  if (best) {
    out.push({
      tone: "info",
      text: `У товара есть варианты — в заказ попадёт тот, которого больше всего на складе${best.stock ? ` (сейчас «${best.name}», ${best.stock} шт)` : ""}.`,
    });
  }
  return out;
}

export function giftWarnings(args: { product: ProductLike | null; productId: string; on: boolean; isCase: boolean }): GiftWarning[] {
  const { product, productId, on, isCase } = args;
  const out = stockWarnings(product, on);
  if (isCase) {
    out.push({
      tone: "info",
      text: `Кладётся от своего порога, если ни один кейс разыграть нельзя (выключены или нет призов)${productId ? "" : " — сейчас не выбран, тогда подарка не будет"}.`,
    });
  } else if (on && !productId) {
    out.push({ tone: "warn", text: "Подарок включён, но товар не выбран — подарка не будет." });
  }
  return out;
}

/** Есть ли предупреждение «подарок не выдастся» (для значка «!» в сводке). */
export const hasGiftProblem = (w: GiftWarning[]) => w.some((x) => x.tone === "warn");
