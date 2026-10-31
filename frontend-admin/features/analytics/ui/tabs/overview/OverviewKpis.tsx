import { num, pct, uah, uahShort } from "../../../model/format";
import type { Overview } from "../../../model/types";
import { KpiTile } from "../../kit";

export function OverviewKpis({ o, prevLabel }: { o: Overview; prevLabel: string }) {
  const k = o.kpis;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <KpiTile
        label="Продано"
        value={uahShort(k.soldMinor.value)}
        kpi={k.soldMinor}
        prevLabel={prevLabel}
        prevValue={uahShort(k.soldMinor.prev)}
        spark={o.series.map((p) => p.soldMinor)}
        hint="Заказы по дате оформления минус возвраты, без отклонённых. Онлайн-заказ — продажа только после оплаты (полной или предоплаты 100 ₴), даже если уже одобрен"
      />
      <KpiTile
        label="Получено"
        value={uahShort(k.receivedMinor.value)}
        kpi={k.receivedMinor}
        prevLabel={prevLabel}
        prevValue={uahShort(k.receivedMinor.prev)}
        spark={o.series.map((p) => p.receivedMinor)}
        hint="Деньги по дате поступления: онлайн-оплата и предоплата — когда пришли, наложка — по отметке «Доставлен»; минус возвраты"
      />
      <KpiTile
        label="Заказов"
        value={num(k.orders.value)}
        kpi={k.orders}
        prevLabel={prevLabel}
        prevValue={num(k.orders.prev)}
        spark={o.series.map((p) => p.orders)}
        hint="Без отклонённых и неоплаченных онлайн"
      />
      <KpiTile label="Средний чек" value={uah(k.aovMinor.value)} kpi={k.aovMinor} prevLabel={prevLabel} prevValue={uah(k.aovMinor.prev)} />
      <KpiTile
        label="Отказы"
        value={pct(k.rejectRatePct.value)}
        kpi={k.rejectRatePct}
        goodWhenUp={false}
        prevLabel={prevLabel}
        prevValue={pct(k.rejectRatePct.prev)}
        hint="Отклонённые от оформленных. Автоотмены за неоплату онлайн сюда не входят — они в блоке «Онлайн-оплата»"
      />
    </div>
  );
}

export function MoneyLine({ money }: { money: Overview["money"] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[var(--text-muted)]">
      <span>
        В пути наложкой: <b className="text-[var(--text)] mx-num">{uah(money.codInTransitMinor)}</b>
        {money.codInTransitOrders > 0 && <> ({num(money.codInTransitOrders)} зак.)</>}
      </span>
      <span>
        Оплачены, ждут подтверждения: <b className="text-[var(--text)] mx-num">{num(money.awaitingPaymentConfirm)}</b>
      </span>
      {money.awaitingPaymentOrders > 0 && (
        <span>
          Ждут онлайн-оплаты (ещё не продано):{" "}
          <b className="text-[var(--text)] mx-num">{num(money.awaitingPaymentOrders)}</b> на{" "}
          <b className="text-[var(--text)] mx-num">{uah(money.awaitingPaymentMinor)}</b>
        </span>
      )}
      {money.refundedMinor > 0 && (
        <span>
          Возвраты за период: <b className="text-[var(--text)] mx-num">{uah(money.refundedMinor)}</b>
        </span>
      )}
    </div>
  );
}
