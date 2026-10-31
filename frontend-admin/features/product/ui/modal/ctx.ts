import type { RefObject } from "react";
import type { AdminProduct } from "../../model/types";
import type { ProductDerived } from "./use-product-derived";
import type { ProductFormState } from "./use-product-form";
import type { ProductSave } from "./use-product-save";

/** Всё, что видят шаги мастера и короткая форма: состояние формы, выводимые значения и действия сохранения. */
export type ProductCtx = ProductFormState &
  ProductDerived &
  ProductSave & {
    product: AdminProduct | null;
    fileRef: RefObject<HTMLInputElement | null>;
    /** Меняется при открытии/смене товара и категории: форма характеристик сбрасывает внутреннее состояние. */
    resetKey: string;
    onClose: () => void;
    onCompleteWithAi?: (productId: string) => void;
  };
