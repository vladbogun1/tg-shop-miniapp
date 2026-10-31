"use client";

import type { Product, ProductVariant } from "@shop/core/types";
import { useEffect, useMemo, useState } from "react";
import type { ExchangeBody } from "../../api";
import {
  addToLines,
  backValueOf,
  buildExchangeBody,
  defaultExchangeOutcome,
  exchangeMoney,
  filterProducts,
  newValueOf,
  stockOf,
  type BackLine,
  type NewLine,
} from "../../model/exchange";
import type { ReturnOrder } from "../../model/types";
import { useExchangeProductsQuery } from "../../queries";

/** Состояние окна обмена: что вернули, на что меняем, подсказка по деньгам. Расчёты — model/exchange.ts. */
export function useExchangeDraft(
  open: boolean,
  order: ReturnOrder | null,
  onSave: (body: ExchangeBody) => Promise<unknown> | void,
) {
  const [back, setBack] = useState<Record<number, BackLine>>({});
  const [lines, setLines] = useState<NewLine[]>([]);
  const [q, setQ] = useState("");
  /** Выбран товар с вариантами — предлагаем выбрать вариант. */
  const [picked, setPicked] = useState<Product | null>(null);
  const [target, setTarget] = useState<ExchangeBody["targetStatus"]>("NEW");
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState("");

  const orderId = order?.id ?? null;
  useEffect(() => {
    if (!open) return;
    setBack({});
    setLines([]);
    setQ("");
    setPicked(null);
    setTarget("NEW");
    setNotify(true);
    setNote("");
  }, [open, orderId]);

  const { data: products = [] } = useExchangeProductsQuery(open);
  const filtered = useMemo(() => filterProducts(products, q), [products, q]);
  const backValue = useMemo(() => (order ? backValueOf(order, back) : 0), [order, back]);
  const newValue = newValueOf(lines);

  const backUnits = Object.values(back).reduce((s, l) => s + l.qty, 0);
  const newUnits = lines.reduce((s, l) => s + l.qty, 0);
  const ready = backUnits > 0 && newUnits > 0;
  const dirty = backUnits > 0 || lines.length > 0 || note.trim() !== "";
  const money = order ? exchangeMoney(order, backValue, newValue) : { credit: 0, due: 0, over: 0 };
  const defaultOutcome = order ? defaultExchangeOutcome(order) : "RESTOCK";
  const stock = (p: Product, v: ProductVariant | null) => stockOf(lines, p, v);

  function setBackLine(id: number, patch: Partial<BackLine>) {
    setBack((prev) => {
      const c = prev[id] ?? { qty: 0, outcome: defaultOutcome };
      return { ...prev, [id]: { ...c, ...patch } };
    });
  }

  function addLine(p: Product, v: ProductVariant | null) {
    if (stock(p, v) <= 0) return;
    setLines((prev) => addToLines(prev, p, v));
    setPicked(null);
    setQ("");
  }

  function pick(p: Product) {
    if (p.variants?.length) setPicked(p);
    else addLine(p, null);
  }

  function setLineQty(key: string, n: number) {
    setLines((prev) => prev.map((x) => (x.key === key ? { ...x, qty: n } : x)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((x) => x.key !== key));
  }

  function submit() {
    if (!ready) return;
    onSave(buildExchangeBody(back, lines, target, notify, note));
  }

  return {
    back,
    lines,
    q,
    setQ,
    picked,
    setPicked,
    target,
    setTarget,
    notify,
    setNotify,
    note,
    setNote,
    filtered,
    backValue,
    newValue,
    ready,
    dirty,
    defaultOutcome,
    ...money,
    stock,
    setBackLine,
    addLine,
    pick,
    setLineQty,
    removeLine,
    submit,
  };
}

export type ExchangeDraft = ReturnType<typeof useExchangeDraft>;
