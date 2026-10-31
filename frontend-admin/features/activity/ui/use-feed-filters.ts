"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/lib/use-debounced";
import { buildFilter, isFiltered } from "../model/filter";
import type { ActivityFilter } from "../model/types";
import type { CustomerFilter } from "./use-row-actions";

/** Источник, тип, результат и покупатель живут выше (карточки счётчиков меняют их тоже). */
export interface FeedShared {
  source: string;
  setSource: (v: string) => void;
  type: string;
  setType: (v: string) => void;
  result: string;
  setResult: (v: string) => void;
  customer: CustomerFilter | null;
  clearCustomer: () => void;
}

/** Поля формы, которые принадлежат только ленте. */
export interface FeedFields {
  recipient: string;
  errorCode: string;
  orderRaw: string;
  qRaw: string;
  from: string;
  to: string;
}

const EMPTY_FIELDS: FeedFields = { recipient: "", errorCode: "", orderRaw: "", qRaw: "", from: "", to: "" };
/** Пауза после последнего символа в «Заказ» и «Поиск», прежде чем идти на сервер. */
const TYPING_DEBOUNCE_MS = 400;

/** Весь фильтр ленты: поля, собранный `filter` для запроса, «что-то задано» и сброс. */
export function useFeedFilters(shared: FeedShared) {
  const { source, type, result, customer } = shared;
  const [fields, setFields] = useState<FeedFields>(EMPTY_FIELDS);
  const order = useDebounced(fields.orderRaw.trim(), TYPING_DEBOUNCE_MS);
  const q = useDebounced(fields.qRaw.trim(), TYPING_DEBOUNCE_MS);
  const customerId = customer?.id;

  const filter: ActivityFilter = useMemo(
    () =>
      buildFilter({
        source,
        type,
        result,
        recipient: fields.recipient,
        errorCode: fields.errorCode,
        order,
        q,
        from: fields.from,
        to: fields.to,
        customerId,
      }),
    [source, type, result, fields.recipient, fields.errorCode, fields.from, fields.to, order, q, customerId]
  );

  function setField(key: keyof FeedFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function reset() {
    shared.setSource("");
    shared.setType("");
    shared.setResult("");
    setFields(EMPTY_FIELDS);
    shared.clearCustomer();
  }

  return { fields, setField, filter, filtered: isFiltered(filter), reset };
}
