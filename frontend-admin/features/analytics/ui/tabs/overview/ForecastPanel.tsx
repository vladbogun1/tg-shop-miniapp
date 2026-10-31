import { CalendarClock, TrendingUp } from "lucide-react";
import { useState } from "react";
import { monthLabel, num, pct, uahShort } from "../../../model/format";
import type { Forecast } from "../../../model/types";
import { ForecastChart } from "../../charts";
import { Empty, Note, Panel } from "../../kit";

export function ForecastPanel({ forecast, error }: { forecast?: Forecast; error: boolean }) {
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
            <div className="flex items-center gap-1.5 field-label !text-[11px]">
              <CalendarClock className="h-3.5 w-3.5" /> {monthLabel(m.month, true)} целиком
            </div>
            <div className="mt-1 kpi-num text-[24px]">≈ {uahShort(m.totalMinor)}</div>
            <div className="mt-1 text-[12px] text-[var(--text-muted)] mx-num">
              вероятно {uahShort(m.lowMinor)} – {uahShort(m.highMinor)}
            </div>
            <div className="mt-2 text-[12px] text-[var(--text-muted)]">
              Уже продано <b className="text-[var(--text)] mx-num">{uahShort(m.actualToDateMinor)}</b>, ещё ≈{" "}
              <b className="text-[var(--text)] mx-num">{uahShort(m.remainingMinor)}</b> за {num(m.daysLeft)} дн.
            </div>
          </div>
          <div className="card-2 p-3">
            <div className="field-label !text-[11px]">Следующие 30 дней</div>
            <div className="mt-1 kpi-num text-[24px]">≈ {uahShort(forecast.next30.totalMinor)}</div>
            <div className="mt-1 text-[12px] text-[var(--text-muted)] mx-num">
              вероятно {uahShort(forecast.next30.lowMinor)} – {uahShort(forecast.next30.highMinor)}
            </div>
          </div>
          <button type="button" onClick={() => setOpen((v) => !v)} className="hit self-start text-[12px] font-semibold text-[var(--accent-hi)] underline-offset-2 hover:underline">
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
