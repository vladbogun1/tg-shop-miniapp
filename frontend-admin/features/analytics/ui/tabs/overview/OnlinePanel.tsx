import { CreditCard } from "lucide-react";
import { dateTime, num, pct, uah, uahExact } from "../../../model/format";
import type { OnlinePayments } from "../../../model/types";
import { Empty, Panel } from "../../kit";
import { Row } from "./Row";

export function OnlinePanel({ p }: { p: OnlinePayments }) {
  return (
    <Panel
      title="Онлайн-оплата (monobank)"
      icon={CreditCard}
      hint="После оплаты статус не меняется — заказ подтверждает админ. Не оплаченный за 24 ч отменяется автоматически."
    >
      {p.since == null ? (
        <Empty>Онлайн-заказов ещё не было</Empty>
      ) : p.orders === 0 && p.invoices === 0 && p.paidMinor === 0 ? (
        <Empty>За период онлайн-заказов нет (первый — {dateTime(p.since)})</Empty>
      ) : (
        <div className="flex flex-col gap-3 text-[13px]">
          <Row
            label="Оформлено с онлайн-оплатой"
            value={num(p.orders)}
            sub={`полная оплата ${num(p.fullOrders)} · предоплата + наложка ${num(p.prepayOrders)}`}
          />
          <Row
            label="Оплатили"
            value={p.conversionPct != null ? pct(p.conversionPct) : "—"}
            sub={`${num(p.paidOrders)} заказов · не оплатили за сутки ${num(p.timedOut)} · ещё ждут ${num(p.awaiting)}`}
          />
          <Row
            label="Счета monobank"
            value={num(p.invoices)}
            sub={`оплачено ${num(p.invoicesPaid)} · отклонено или истекло ${num(p.invoicesFailed)}`}
          />
          <div className="border-t border-[var(--line)] pt-2 flex flex-col gap-3">
            <Row label="Пришло онлайн" value={uah(p.paidMinor)} />
            <Row label="Возвраты на карту" value={uahExact(p.refundedMinor)} />
            <Row label="Комиссия банка" value={uahExact(p.feeMinor)} sub={p.paidMinor > 0 ? `${pct((p.feeMinor * 100) / p.paidMinor, 2)} от оплат` : undefined} />
          </div>
        </div>
      )}
    </Panel>
  );
}
