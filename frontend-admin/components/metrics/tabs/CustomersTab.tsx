"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BadgePercent, Crown, Repeat, ShoppingBasket, UserPlus, Users } from "lucide-react";
import { QueryState } from "@/components/ui/QueryState";
import { staggerContainer } from "@/lib/motion";
import { metricsApi, type Customers, type PeriodParams } from "../api";
import { RankBars } from "../charts";
import { bucketLabel, monthLabel, num, pct, uah, uahShort } from "../format";
import { PREV_LABEL } from "../period";
import { Empty, InlineBar, KpiTile, Panel, TableWrap } from "../ui";

export function CustomersTab({ params }: { params: PeriodParams }) {
  const q = useQuery({
    queryKey: ["metrics2", "customers", params],
    queryFn: () => metricsApi.customers(params),
    placeholderData: keepPreviousData,
  });
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем покупателей…">
      {q.data && <CustomersBody c={q.data} params={params} />}
    </QueryState>
  );
}

/** Cohort cell: sequential blue by share; empty for months that have not happened yet. */
function cohortBg(v: number | null): string {
  if (v == null) return "transparent";
  if (v === 0) return "var(--mx-q0)";
  const steps = ["--mx-q1", "--mx-q2", "--mx-q3", "--mx-q4", "--mx-q5"];
  return `var(${steps[Math.min(steps.length - 1, Math.floor(v / 4))]})`;
}

function CustomersBody({ c, params }: { c: Customers; params: PeriodParams }) {
  const k = c.kpis;
  const prevLabel = PREV_LABEL[params.period];
  const maxSignup = Math.max(1, ...c.signups.map((s) => s.newUsers));
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Покупателей" value={num(k.buyers.value)} kpi={k.buyers} prevLabel={prevLabel} prevValue={num(k.buyers.prev)} hint="Telegram-аккаунты с не отклонённым заказом" />
        <KpiTile label="Новых" value={num(k.newBuyers.value)} kpi={k.newBuyers} prevLabel={prevLabel} prevValue={num(k.newBuyers.prev)} hint="Первый заказ в магазине — в этом периоде" />
        <KpiTile
          label="Повторных"
          value={`${num(k.repeatBuyers)} · ${pct(k.repeatPct)}`}
          hint={`Покупали раньше или 2+ раза за период. За всё время повторных: ${pct(k.allTimeRepeatPct)}`}
        />
        <KpiTile label="Средний LTV" value={uah(k.avgLtvMinor)} hint="Сколько в среднем покупатель принёс за всё время" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Сколько раз покупают" icon={Repeat} hint="Все покупатели за всё время">
          <RankBars rows={c.repeatDistribution.map((r) => ({ key: r.label, label: r.label, value: r.buyers }))} format={(v) => `${num(v)} чел.`} />
        </Panel>
        <Panel title="Чеки" icon={ShoppingBasket} hint={`Распределение заказов периода по сумме · в среднем ${c.avgItemsPerOrder.toLocaleString("ru-RU")} шт. в заказе`}>
          <RankBars
            rows={c.aovBuckets.map((b) => ({ key: b.label, label: b.label, value: b.orders }))}
            format={(v) => `${num(v)} зак.`}
            sub={(key) => {
              const b = c.aovBuckets.find((x) => x.label === key)!;
              return `на ${uahShort(b.soldMinor)}`;
            }}
          />
        </Panel>
      </div>

      <Panel
        title="Возвращаются ли покупатели"
        icon={Users}
        hint="Когорты по месяцу первого заказа: какой процент из них купил снова через 1, 2, … 6 месяцев (без учёта периода сверху)"
      >
        {c.cohorts.length === 0 ? (
          <Empty>Нет данных</Empty>
        ) : (
          <TableWrap>
            <table className="mx-table">
              <thead>
                <tr>
                  <th>Первый заказ</th>
                  <th className="r">Покупателей</th>
                  {[1, 2, 3, 4, 5, 6].map((m) => (
                    <th key={m} className="r">
                      +{m} мес
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.cohorts.map((row) => (
                  <tr key={row.month}>
                    <td className="font-bold">{monthLabel(row.month)}</td>
                    <td className="r">{num(row.buyers)}</td>
                    {row.returnedPct.map((v, i) => (
                      <td key={i} className="r">
                        {v == null ? (
                          <span className="text-[var(--text-faint)]">·</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-3 w-3 rounded-[2px] border border-[var(--line)]" style={{ background: cohortBg(v) }} />
                            {pct(v)}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>

      <Panel
        title="Пользователи бота → покупатели"
        icon={UserPlus}
        hint="Новые пользователи по неделям и сколько из них сделали заказ в течение 30 дней. Свежие недели ещё «дозревают»."
      >
        <TableWrap>
          <table className="mx-table">
            <thead>
              <tr>
                <th>Неделя</th>
                <th className="r">Новых</th>
                <th className="w-[35%]" />
                <th className="r">Купили за 30 дн</th>
                <th className="r">Конверсия</th>
              </tr>
            </thead>
            <tbody>
              {c.signups.map((s) => (
                <tr key={s.weekStart}>
                  <td className="font-bold">{bucketLabel(s.weekStart, "WEEK")}</td>
                  <td className="r">{num(s.newUsers)}</td>
                  <td>
                    <InlineBar value={s.newUsers} max={maxSignup} />
                  </td>
                  <td className="r">{num(s.orderedWithin30)}</td>
                  <td className="r">
                    {pct(s.conversionPct)}
                    {!s.complete && <span className="ml-1 text-[11px] text-[var(--text-faint)]">(ещё идёт)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Лучшие клиенты" icon={Crown} hint="По деньгам, полученным в периоде">
          {c.topCustomers.length === 0 ? (
            <Empty>Нет оплат за период</Empty>
          ) : (
            <TableWrap>
              <table className="mx-table">
                <thead>
                  <tr>
                    <th>Клиент</th>
                    <th className="r">Заказов</th>
                    <th className="r">Получено</th>
                  </tr>
                </thead>
                <tbody>
                  {c.topCustomers.map((t) => (
                    <tr key={String(t.telegramUserId)}>
                      <td>
                        <div className="font-bold">{t.name ?? "—"}</div>
                        {t.username && <div className="text-[11px] text-[var(--text-faint)]">@{t.username}</div>}
                      </td>
                      <td className="r">{num(t.orders)}</td>
                      <td className="r font-extrabold">{uah(t.receivedMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>

        <Panel title="Промокоды" icon={BadgePercent} hint="Заказы периода с кодом: скидка, продажи, сколько из них — первый заказ покупателя">
          {c.promoCodes.length === 0 ? (
            <Empty>Промокодами в этом периоде не пользовались</Empty>
          ) : (
            <TableWrap>
              <table className="mx-table">
                <thead>
                  <tr>
                    <th>Код</th>
                    <th className="r">Заказов</th>
                    <th className="r">Скидка</th>
                    <th className="r">Продано</th>
                    <th className="r">Новых</th>
                    <th className="r">Отказы</th>
                  </tr>
                </thead>
                <tbody>
                  {c.promoCodes.map((p) => (
                    <tr key={p.code}>
                      <td className="font-bold">{p.code}</td>
                      <td className="r">{num(p.orders)}</td>
                      <td className="r">{uah(p.discountMinor)}</td>
                      <td className="r">{uahShort(p.soldMinor)}</td>
                      <td className="r">{num(p.newBuyers)}</td>
                      <td className="r">{pct(p.rejectRatePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>
      </div>
    </motion.div>
  );
}
