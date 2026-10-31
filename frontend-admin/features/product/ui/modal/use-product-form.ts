"use client";

import type { CardStatus } from "@shop/core/catalog";
import { useEffect, useRef, useState } from "react";
import { initialCardStatus, initialForm, stockBaseOf, type ProductForm, type StockBase } from "../../model/form";
import { S, STEPS, type ProductStepKey } from "../../model/steps";
import type { AdminProduct } from "../../model/types";

/**
 * Состояние окна товара: значения формы, снимок для проверки «есть несохранённые правки», шаг мастера,
 * остатки, с которыми открыли форму (их проверяет сервер), статус карточки.
 */
export function useProductForm(open: boolean, product: AdminProduct | null, initialStep: ProductStepKey | undefined) {
  const [step, setStep] = useState(0);
  // Читается при открытии окна (не зависимость: смена не должна сбрасывать открытую форму).
  const initialStepRef = useRef(initialStep);
  initialStepRef.current = initialStep;
  const [dir, setDir] = useState(1);
  const [f, setF] = useState<ProductForm>(() => initialForm(product));
  const [confirmClose, setConfirmClose] = useState(false);
  const [cardStatus, setCardStatus] = useState<CardStatus>("DRAFT");
  const [showMissing, setShowMissing] = useState(false);

  // С чем открыли форму: по нему считается «есть несохранённые правки», а остатки — это `expectedStock`,
  // который проверяет сервер (после 409 заменяются свежими числами).
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const baseStockRef = useRef<StockBase>({ stock: 0, variants: {} });

  useEffect(() => {
    if (!open) return;
    const fresh = initialForm(product);
    // Мастер нового товара всегда начинается с начала.
    setStep(product && initialStepRef.current ? S[initialStepRef.current] : 0);
    setDir(1);
    setConfirmClose(false);
    setShowMissing(false);
    setF(fresh);
    setCardStatus(initialCardStatus(product));
    setInitialSnapshot(JSON.stringify(fresh));
    baseStockRef.current = stockBaseOf(fresh);
  }, [open, product]);

  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const dirty = open && JSON.stringify(f) !== initialSnapshot;

  const changeCategory = (id: string) => setF((p) => ({ ...p, categoryId: id }));

  function go(to: number) {
    if (to < 0 || to >= STEPS.length) return;
    setDir(to > step ? 1 : -1);
    setStep(to);
  }

  return { f, setF, set, dirty, step, dir, go, changeCategory, confirmClose, setConfirmClose, cardStatus, setCardStatus, showMissing, setShowMissing, baseStockRef };
}

export type ProductFormState = ReturnType<typeof useProductForm>;
