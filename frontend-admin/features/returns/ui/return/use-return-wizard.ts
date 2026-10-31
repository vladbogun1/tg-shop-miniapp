"use client";

import { money } from "@/lib/money";
import { useEffect, useRef, useState } from "react";
import type { ReturnWizardBody } from "../../api";
import {
  buildReturnBody,
  defaultWhere,
  deriveReturn,
  isMoneyOnly,
  nextDisabled,
  toInput,
  unitsLeft,
  type ReturnDerived,
  type WizardChoice,
  type WizardStep,
} from "../../model/return-wizard";
import type { GiftChoice, ReturnOrder, ReturnOrderItem, ReturnWhere } from "../../model/types";

/** Состояние мастера возврата: шаги, выбор, сумма, комментарий. Расчёты — в model/return-wizard.ts. */
export function useReturnWizard(
  open: boolean,
  order: ReturnOrder | null,
  onSave: (body: ReturnWizardBody) => Promise<unknown> | void,
) {
  const [step, setStep] = useState<WizardStep>(1);
  const [where, setWhere] = useState<ReturnWhere>("HERE");
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [defect, setDefect] = useState<Record<number, number>>({});
  /** Подарок спрашивается отдельно по каждому: подарок за сумму и приз кейса могут решаться по-разному. */
  const [giftChoice, setGiftChoice] = useState<Record<number, GiftChoice>>({});
  const [amount, setAmount] = useState("");
  /** Сумму набрали руками — при ходе вперёд-назад её не трогаем. */
  const [amountTouched, setAmountTouched] = useState(false);
  const [viaMono, setViaMono] = useState(true);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);

  const orderId = order?.id ?? null;
  // moneyOnly / where следуют за открытым заказом (orderId), а не за каждым обновлением его данных.
  const orderRef = useRef(order);
  orderRef.current = order;
  useEffect(() => {
    if (!open) return;
    const o = orderRef.current;
    setStep(o && isMoneyOnly(o) ? 2 : 1);
    setWhere(o ? defaultWhere(o) : "HERE");
    setPicked({});
    setDefect({});
    setGiftChoice({});
    setAmount("");
    setAmountTouched(false);
    setViaMono(true);
    setNote("");
    setNotify(true);
  }, [open, orderId]);

  const choice: WizardChoice = {
    where,
    picked,
    defect,
    giftChoice,
    amount,
    viaMono,
  };
  const d: ReturnDerived | null = order ? deriveReturn(order, choice, (m) => money(m, order.currency ?? "UAH")) : null;

  function setPick(it: ReturnOrderItem, n: number) {
    const v = Math.max(0, Math.min(unitsLeft(it), n));
    setPicked((p) => ({ ...p, [it.id!]: v }));
    setDefect((p) => ({ ...p, [it.id!]: Math.min(p[it.id!] ?? 0, v) }));
  }

  function setBroken(it: ReturnOrderItem, n: number) {
    const max = picked[it.id!] ?? 0;
    setDefect((p) => ({ ...p, [it.id!]: Math.max(0, Math.min(max, n)) }));
  }

  function chooseGift(id: number, v: GiftChoice) {
    setGiftChoice((p) => ({ ...p, [id]: v }));
  }

  function typeAmount(v: string) {
    setAmount(v);
    setAmountTouched(true);
  }

  function next() {
    if (!d) return;
    if (step === 1) {
      if (!amountTouched) setAmount(toInput(d.suggested));
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }

  function back() {
    if (step === 3) setStep(2);
    else if (step === 2 && !(d?.moneyOnly ?? false)) setStep(1);
  }

  const nothing = !!d && d.units === 0 && d.amountMinor === 0;
  const blocked = !!d && (nothing || d.needsCompensation || d.errors.length > 0);

  function submit() {
    if (!d || blocked) return;
    onSave(buildReturnBody(d, choice, note, notify));
  }

  return {
    step,
    choice,
    d,
    note,
    setNote,
    notify,
    setNotify,
    setWhere,
    setViaMono,
    setPick,
    setBroken,
    chooseGift,
    typeAmount,
    next,
    back,
    submit,
    blocked,
    nextBlocked: d ? nextDisabled(step, d, choice) : true,
    dirty: !!d && (d.units > 0 || d.amountMinor > 0 || note.trim() !== ""),
  };
}

export type ReturnWizard = ReturnType<typeof useReturnWizard>;
