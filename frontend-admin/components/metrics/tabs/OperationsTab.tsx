"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, Bug, CreditCard, Timer, Truck, XCircle } from "lucide-react";
import { QueryState } from "@/components/ui/QueryState";
import { DELIVERY_LABEL } from "@/lib/orders";
import { staggerContainer } from "@/lib/motion";
import { metricsApi, type Operations, type PeriodParams, type Violation } from "../api";
import { RankBars } from "../charts";
import { dateTime, duration, num, pct, shortId, uah } from "../format";
import { Empty, Note, Panel, StatusChip, TableWrap } from "../ui";

export function OperationsTab({ params }: { params: PeriodParams }) {
  const q = useQuery({
    queryKey: ["metrics2", "operations", params],
    queryFn: () => metricsApi.operations(params),
    placeholderData: keepPreviousData,
  });
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем…">
      {q.data && <OperationsBody o={q.data} />}
    </QueryState>
  );
}

function OperationsBody({ o }: { o: Operations }) {
  const r = o.rejects;
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-4">
      <Panel title="Скорость обработки" icon={Timer} hint="Медиана — типичный заказ; p90 — 9 из 10 заказов укладываются в это время. По заказам, оформленным в периоде.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {o.speed.map((s) => (
            <div key={s.key} className="card-2 p-3">
              <div className="field-label !text-[11px]">{s.label}</div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="kpi-num text-[22px]">{duration(s.medianHours)}</span>
                <span className="text-[12px] text-[var(--text-muted)] mx-num">p90 {duration(s.p90Hours)}</span>
              </div>
              <div className="mt-1 text-[11px] text-[var(--text-faint)]">
                {num(s.count)} заказов{s.note ? ` · ${s.note}` : ""}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <ViolationPanel
          title="Одобрен, но не отправлен > 24 ч"
          rows={o.approvedNotShipped}
          sinceLabel="Одобрен"
          empty="Все одобренные заказы отправляются вовремя"
        />
        <ViolationPanel
          title="Отправлен, но не «Доставлен» > 7 дн"
          rows={o.shippedNotDelivered}
          sinceLabel="Отправлен"
          empty="Зависших посылок нет"
        />
      </div>

      <Panel
        title="Причины отказов"
        icon={XCircle}
        hint={`${num(r.rejected)} из ${num(r.total)} заказов периода отклонены (${pct(r.ratePct)})`}
      >
        {r.byReason.length === 0 ? (
          <Empty>Отказов за период нет</Empty>
        ) : (
          <RankBars rows={r.byReason.map((x) => ({ key: x.key, label: x.label, value: x.count }))} format={(v) => `${num(v)}`} />
        )}
        <div className="mt-3 flex flex-col gap-2">
          {!r.codes && (
            <Note>
              Справочника причин пока нет в базе — показаны самые частые формулировки из текста. Когда в карточке заказа появится
              выбор причины, здесь будут коды; старые заказы попадут в «Не указано».
            </Note>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[var(--text-muted)]">
            <span>
              Отказ после отправки (вернулся с почты): <b className="text-[var(--text)]">{num(r.afterShipping)}</b>
            </span>
            {r.paidNotRefunded > 0 && (
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--warn)]" />
                Деньги получены по отклонённым без отметки возврата:{" "}
                <b className="text-[var(--text)]">
                  {num(r.paidNotRefunded)} зак. на {uah(r.paidNotRefundedMinor)}
                </b>
              </span>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Способы доставки" icon={Truck}>
          <RankBars
            rows={o.deliveryMethods.map((d) => ({
              key: d.key,
              label: DELIVERY_LABEL[d.key as keyof typeof DELIVERY_LABEL] ?? d.label,
              value: d.count,
            }))}
            format={(v) => num(v)}
          />
        </Panel>
        <Panel title="Способы оплаты" icon={CreditCard} hint="«Не указано» — старые заказы, оформленные до выбора способа оплаты">
          <RankBars rows={o.paymentOptions.map((d) => ({ key: d.key, label: d.label, value: d.count }))} format={(v) => num(v)} />
        </Panel>
      </div>

      <Panel title="Ошибки у покупателей за 7 дней" icon={Bug} hint="Из журнала Mini App и сайта. «Script error.» — ошибка без подробностей (скрипт с другого домена).">
        {o.clientErrors.length === 0 ? (
          <Empty>Ошибок нет</Empty>
        ) : (
          <TableWrap>
            <table className="mx-table">
              <thead>
                <tr>
                  <th>Сообщение</th>
                  <th className="r">Раз</th>
                  <th className="r">Людей</th>
                </tr>
              </thead>
              <tbody>
                {o.clientErrors.map((e) => (
                  <tr key={e.message}>
                    <td className="max-w-[520px] break-words font-mono text-[12px]">{e.message}</td>
                    <td className="r">{num(e.count)}</td>
                    <td className="r">{num(e.users)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>
    </motion.div>
  );
}

function ViolationPanel({ title, rows, sinceLabel, empty }: { title: string; rows: Violation[]; sinceLabel: string; empty: string }) {
  return (
    <Panel title={title} icon={AlertTriangle} hint="Сейчас, независимо от периода">
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <TableWrap>
          <table className="mx-table">
            <thead>
              <tr>
                <th>Заказ</th>
                <th>{sinceLabel}</th>
                <th className="r">Ждёт</th>
                <th className="r">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.orderId}>
                  <td>
                    <div className="font-semibold mx-num">#{shortId(v.orderId)}</div>
                    <div className="text-[11px] text-[var(--text-faint)]">{v.customerName ?? ""}</div>
                  </td>
                  <td className="mx-num">{dateTime(v.since)}</td>
                  <td className="r">
                    <StatusChip tone={v.hours > 72 ? "danger" : "warn"}>{duration(v.hours)}</StatusChip>
                  </td>
                  <td className="r">{uah(v.totalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Panel>
  );
}
