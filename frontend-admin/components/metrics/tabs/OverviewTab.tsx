"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarClock, Gift, Grid3x3, LineChart as LineIcon, Shapes, Split, TrendingUp } from "lucide-react";
import { useState } from "react";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { staggerContainer } from "@/lib/motion";
import { metricsApi, type Forecast, type Overview, type PeriodParams } from "../api";
import { ForecastChart, Heatmap, OrdersChart, RankBars, SalesChart } from "../charts";
import { monthLabel, num, pct, uah, uahShort } from "../format";
import { PREV_LABEL } from "../period";
import { Empty, KpiTile, Note, Panel, TableWrap } from "../ui";

const SOURCE_LABEL: Record<string, string> = { MINIAPP: "Mini App", WEB: "Сайт", ADMIN: "Админка" };

export function OverviewTab({ params }: { params: PeriodParams }) {
  const q = useQuery({
    queryKey: ["metrics2", "overview", params],
    queryFn: () => metricsApi.overview(params),
    placeholderData: keepPreviousData,
    refetchInterval: 120_000,
  });
  const fq = useQuery({
    queryKey: ["metrics2", "forecast", params.channel],
    queryFn: () => metricsApi.forecast(params.channel),
    staleTime: 300_000,
  });
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем продажи…">
      {q.data && <OverviewBody o={q.data} params={params} forecast={fq.data} forecastError={fq.isError} />}
    </QueryState>
  );
}

function OverviewBody({
  o,
  params,
  forecast,
  forecastError,
}: {
  o: Overview;
  params: PeriodParams;
  forecast?: Forecast;
  forecastError: boolean;
}) {
  const [metric, setMetric] = useState<"soldMinor" | "receivedMinor">("soldMinor");
  const k = o.kpis;
  const prevLabel = PREV_LABEL[params.period];
  const g = o.period.granularity;

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          label="Продано"
          value={uahShort(k.soldMinor.value)}
          kpi={k.soldMinor}
          prevLabel={prevLabel}
          prevValue={uahShort(k.soldMinor.prev)}
          spark={o.series.map((p) => p.soldMinor)}
          hint="Заказы, кроме отклонённых, по дате оформления"
        />
        <KpiTile
          label="Получено"
          value={uahShort(k.receivedMinor.value)}
          kpi={k.receivedMinor}
          prevLabel={prevLabel}
          prevValue={uahShort(k.receivedMinor.prev)}
          spark={o.series.map((p) => p.receivedMinor)}
          hint="Деньги по дате оплаты, минус возвраты"
        />
        <KpiTile
          label="Заказов"
          value={num(k.orders.value)}
          kpi={k.orders}
          prevLabel={prevLabel}
          prevValue={num(k.orders.prev)}
          spark={o.series.map((p) => p.orders)}
          hint="Без отклонённых"
        />
        <KpiTile label="Средний чек" value={uah(k.aovMinor.value)} kpi={k.aovMinor} prevLabel={prevLabel} prevValue={uah(k.aovMinor.prev)} />
        <KpiTile
          label="Отказы"
          value={pct(k.rejectRatePct.value)}
          kpi={k.rejectRatePct}
          goodWhenUp={false}
          prevLabel={prevLabel}
          prevValue={pct(k.rejectRatePct.prev)}
          hint="Отклонённые от всех оформленных"
        />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[var(--text-muted)]">
        <span>
          В пути наложкой: <b className="text-[var(--text)] mx-num">{uah(o.money.codInTransitMinor)}</b>
          {o.money.codInTransitOrders > 0 && <> ({num(o.money.codInTransitOrders)} зак.)</>}
        </span>
        <span>
          Ждут подтверждения оплаты: <b className="text-[var(--text)] mx-num">{num(o.money.awaitingPaymentConfirm)}</b>
        </span>
        {o.money.refundedMinor > 0 && (
          <span>
            Возвраты за период: <b className="text-[var(--text)] mx-num">{uah(o.money.refundedMinor)}</b>
          </span>
        )}
      </div>

      <ForecastPanel forecast={forecast} error={forecastError} />

      <Panel
        title={metric === "soldMinor" ? "Продажи по времени" : "Поступления по времени"}
        icon={LineIcon}
        hint={g === "WEEK" ? "По неделям" : g === "HOUR" ? "По часам" : "По дням"}
        actions={
          <SegmentedControl
            size="sm"
            options={[
              { value: "soldMinor", label: "Продано" },
              { value: "receivedMinor", label: "Получено" },
            ]}
            value={metric}
            onChange={setMetric}
          />
        }
      >
        <SalesChart series={o.series} prev={o.prevSeries} granularity={g} metric={metric} />
        <div className="mt-4">
          <OrdersChart series={o.series} granularity={g} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Категории"
          icon={Shapes}
          hint="Выручка после скидок, без отказов и подарков. Товар в двух категориях считается в обеих."
        >
          {o.categories.filter((c) => c.revenueMinor > 0).length === 0 ? (
            <Empty>Продаж за период нет</Empty>
          ) : (
            <RankBars
              rows={o.categories.filter((c) => c.revenueMinor > 0).map((c) => ({ key: c.name, label: c.name, value: c.revenueMinor }))}
              format={uahShort}
              sub={(name) => {
                const c = o.categories.find((x) => x.name === name)!;
                return `${pct(c.sharePct)} выручки · ${num(c.units)} шт. · ${num(c.liveProducts)} товаров на витрине · ${c.unitsPerProduct.toLocaleString("ru-RU")} шт. на товар`;
              }}
            />
          )}
          {o.categories.some((c) => c.revenueMinor === 0 && c.liveProducts > 0) && (
            <div className="mt-3 text-[12px] text-[var(--text-muted)]">
              Без продаж за период:{" "}
              {o.categories
                .filter((c) => c.revenueMinor === 0 && c.liveProducts > 0)
                .map((c) => `${c.name} (${c.liveProducts})`)
                .join(", ")}
            </div>
          )}
        </Panel>

        <Panel title="Mini App и сайт" icon={Split} hint="Сравнение каналов за период (фильтр канала здесь не действует)">
          <TableWrap>
            <table className="mx-table">
              <thead>
                <tr>
                  <th>Канал</th>
                  <th className="r">Заказы</th>
                  <th className="r">Продано</th>
                  <th className="r">Чек</th>
                  <th className="r">Отказы</th>
                  <th className="r">Конверсия</th>
                </tr>
              </thead>
              <tbody>
                {o.channels.map((c) => (
                  <tr key={c.source}>
                    <td className="font-bold">{SOURCE_LABEL[c.source] ?? c.source}</td>
                    <td className="r">{num(c.orders)}</td>
                    <td className="r">{uahShort(c.soldMinor)}</td>
                    <td className="r">{uah(c.aovMinor)}</td>
                    <td className="r">{pct(c.rejectRatePct)}</td>
                    <td className="r" title={c.visitors != null ? `${num(c.buyers)} покупателей из ${num(c.visitors)} посетителей` : undefined}>
                      {c.conversionPct != null ? pct(c.conversionPct) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="mt-2 text-[11px] text-[var(--text-faint)]">
            Конверсия = покупатели / уникальные посетители. Видна, когда журнал событий покрывает весь период
            (события Mini App хранятся с сентября, сайта — с выхода этой версии).
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel title="Когда приходят заказы" icon={Grid3x3} hint="Все оформленные заказы за период: день недели × час (Киев). Подсказка, когда делать рассылки.">
          <Heatmap grid={o.heatmap} />
        </Panel>
        <Panel title="Отданная выручка" icon={Gift} hint="Сколько денег ушло на скидки и подарки за период">
          <div className="flex flex-col gap-3 text-[13px]">
            <Row label="Скидки по промокодам" value={uah(o.giveaways.discountMinor)} sub={`${num(o.giveaways.promoOrders)} заказов с промокодом`} />
            <Row
              label="Подарки (по розничной цене)"
              value={uah(o.giveaways.giftValueMinor)}
              sub={`${num(o.giveaways.giftUnits)} шт.`}
            />
            <div className="border-t-2 border-[var(--line)] pt-2">
              <Row label="Итого отдано" value={uah(o.giveaways.discountMinor + o.giveaways.giftValueMinor)} />
            </div>
          </div>
        </Panel>
      </div>
    </motion.div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="font-bold text-[var(--text)]">{label}</div>
        {sub && <div className="text-[11px] text-[var(--text-faint)]">{sub}</div>}
      </div>
      <div className="shrink-0 font-extrabold text-[var(--text)] mx-num">{value}</div>
    </div>
  );
}

function ForecastPanel({ forecast, error }: { forecast?: Forecast; error: boolean }) {
  const [open, setOpen] = useState(false);
  if (error) {
    return (
      <Panel title="Прогноз выручки" icon={TrendingUp}>
        <Empty>Прогноз не загрузился</Empty>
      </Panel>
    );
  }
  if (!forecast) {
    return (
      <Panel title="Прогноз выручки" icon={TrendingUp}>
        <Empty>Считаем прогноз…</Empty>
      </Panel>
    );
  }
  const m = forecast.month;
  const a = forecast.accuracy;
  return (
    <Panel
      title="Прогноз выручки"
      icon={TrendingUp}
      hint={`Продано (без отказов). ${a.label}${a.mape30 != null ? `: в среднем ошибка ±${pct(a.mape30, 0)} на 30 дней` : ""}.`}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-3">
          <div className="card-2 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <CalendarClock className="h-3.5 w-3.5" /> {monthLabel(m.month, true)} целиком
            </div>
            <div className="mt-1 text-[24px] font-extrabold leading-none text-[var(--text)] mx-num">≈ {uahShort(m.totalMinor)}</div>
            <div className="mt-1 text-[12px] text-[var(--text-muted)] mx-num">
              вероятно {uahShort(m.lowMinor)} – {uahShort(m.highMinor)}
            </div>
            <div className="mt-2 text-[12px] text-[var(--text-muted)]">
              Уже продано <b className="text-[var(--text)] mx-num">{uahShort(m.actualToDateMinor)}</b>, ещё ≈{" "}
              <b className="text-[var(--text)] mx-num">{uahShort(m.remainingMinor)}</b> за {num(m.daysLeft)} дн.
            </div>
          </div>
          <div className="card-2 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Следующие 30 дней</div>
            <div className="mt-1 text-[24px] font-extrabold leading-none text-[var(--text)] mx-num">≈ {uahShort(forecast.next30.totalMinor)}</div>
            <div className="mt-1 text-[12px] text-[var(--text-muted)] mx-num">
              вероятно {uahShort(forecast.next30.lowMinor)} – {uahShort(forecast.next30.highMinor)}
            </div>
          </div>
          <button type="button" onClick={() => setOpen((v) => !v)} className="hit self-start text-[12px] font-bold text-[var(--accent)] underline-offset-2 hover:underline">
            {open ? "Скрыть, как считается" : "Как считается и насколько точно"}
          </button>
        </div>
        <div className="min-w-0">
          <ForecastChart history={forecast.history} forecast={forecast.forecast} />
        </div>
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <Note>{forecast.method}</Note>
          <Note>
            Проверка на истории магазина ({num(a.backtests)} прогнозов «на 30 дней вперёд» из прошлого): средняя ошибка{" "}
            <b>{pct(a.mape30)}</b>, у наивного «как прошлые 30 дней» — {pct(a.naiveMape30)}; смещение {pct(a.bias30)}
            {a.coveragePct != null && <> ; факт попадал в диапазон в {pct(a.coveragePct, 0)} случаев</>}. Продажи магазина сильно
            скачут от месяца к месяцу, поэтому диапазон широкий — ориентируйтесь на него, а не на одно число.
          </Note>
        </div>
      )}
    </Panel>
  );
}
