"use client";

import { Undo2 } from "lucide-react";
import { num, uah } from "../../../model/format";
import type { PeriodParams, Returns } from "../../../model/types";
import { useReturns } from "../../../queries";
import { Empty, Note, Panel } from "../../kit";
import { Row } from "./Row";

const CHANNEL_LABEL: Record<string, string> = {
  MONO: "monobank (на карту)",
  NP_COD: "Наложка НП",
  NP_PAYMENT_CONTROL: "Контроль оплаты НП",
  CARD_TRANSFER: "Перевод на карту",
  CASH: "Наличные",
  NP_CLAIM: "Претензия НП",
  OTHER: "Другое",
  EXCHANGE: "Зачёт в обмен",
  MERGE: "Перенос при объединении",
};
const REASON_LABEL: Record<string, string> = {
  DEFECT: "Брак",
  INVENTORY: "Инвентаризация",
  MISSORT: "Пересорт",
  SOLD_OFFLINE: "Продано вне магазина",
  OTHER: "Другое",
};

/** Money that went back by the day it went back, what the shop kept on purpose, and write-offs (V68). */
export function ReturnsPanel({ params }: { params: PeriodParams }) {
  const q = useReturns(params);
  const r: Returns | undefined = q.data;
  return (
    <Panel
      title="Возвраты и списания"
      icon={Undo2}
      hint="Возвраты денег — по дню, когда деньги ушли, из журнала денег заказа. Удержано — предоплата, оставленная за доставку при отказе."
    >
      {!r ? (
        <Note>{q.isError ? "Не удалось загрузить" : "Считаем…"}</Note>
      ) : r.refundedMinor === 0 && r.retainedMinor === 0 && r.writeoffUnits === 0 && r.returnedOrders === 0 ? (
        <Empty>За период возвратов и списаний нет</Empty>
      ) : (
        <div className="grid gap-4 text-[13px] md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Row label="Вернули клиентам" value={uah(r.refundedMinor)} sub={`${num(r.refundOrders)} заказов · возвратов товара: ${num(r.returnedOrders)}`} />
            {r.byChannel.map((c) => (
              <Row key={c.channel} label={CHANNEL_LABEL[c.channel] ?? c.channel} value={uah(c.amountMinor)} sub={`${num(c.count)} раз`} />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Row label="Удержано (доставка)" value={uah(r.retainedMinor)} sub={`${num(r.retainedOrders)} заказов`} />
          </div>
          <div className="flex flex-col gap-2">
            <Row label="Списано со склада" value={uah(r.writeoffMinor)} sub={`${num(r.writeoffUnits)} шт.`} />
            {r.writeoffsByReason.map((w) => (
              <Row key={w.reason} label={REASON_LABEL[w.reason] ?? w.reason} value={uah(w.valueMinor)} sub={`${num(w.units)} шт.`} />
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
