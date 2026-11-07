"use client";

/**
 * Вкладка «ИИ» в метриках (только финансистам): строка итога месяца, четыре плитки (доля встроенного ИИ, принято
 * без правок, зря потрачено, ждёт проверки) и «Подробнее» с графиком расхода по дням. Период — тот же, что на других
 * вкладках: даты приходят от экрана метрик. Тестовый админ в цифры не входит.
 */
import { useState } from "react";
import { QueryState } from "@/components/ui/QueryState";
import { fastApplyText, monthLine, noEditsTile, shareTile, waitingTile, wasteLabel, wasteTile, dayPoints, type Tile } from "../model/metrics-view";
import { uahFromMinor } from "../model/format";
import { useAiMetrics, useAiMetricsDays } from "../queries-center";
import { AiMetricsChart } from "./AiMetricsChart";

function MetricTile({ tile, testId }: { tile: Tile; testId: string }) {
  return (
    <div className="card flex min-w-0 flex-col gap-1.5 p-4" data-testid={testId}>
      <div className="field-label !text-[11px]">{tile.label}</div>
      <div className="kpi-num text-[24px]">{tile.value}</div>
      <div className="text-[11px] leading-snug text-[var(--text-faint)]">{tile.hint}</div>
    </div>
  );
}

export function AiMetrics({ from, to }: { from: string; to: string }) {
  const q = useAiMetrics(from, to);
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем ИИ…">
      {q.data && <Body m={q.data} from={from} to={to} />}
    </QueryState>
  );
}

function Body({ m, from, to }: { m: NonNullable<ReturnType<typeof useAiMetrics>["data"]>; from: string; to: string }) {
  const [more, setMore] = useState(false);
  const days = useAiMetricsDays(from, to, more);
  const fast = fastApplyText(m.fastApply);
  return (
    <div className="flex flex-col gap-4">
      <div className="panel p-4 text-[14px] font-semibold text-[var(--text)]" data-testid="ai-month-line">
        {monthLine(m.month)}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile testId="ai-tile-share" tile={shareTile(m.share)} />
        <MetricTile testId="ai-tile-noedits" tile={noEditsTile(m.noEdits)} />
        <MetricTile testId="ai-tile-waste" tile={wasteTile(m)} />
        <MetricTile testId="ai-tile-waiting" tile={waitingTile(m.waiting)} />
      </div>
      <div className="panel p-4">
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          data-testid="ai-more"
          className="text-[13px] font-semibold text-[var(--accent)]"
        >
          {more ? "Скрыть" : "Подробнее"}
        </button>
        {more && (
          <div className="mt-3 flex flex-col gap-4">
            <div className="text-[12.5px] text-[var(--text-muted)]">
              За период потрачено {uahFromMinor(m.spentMinor)}, принято задач: {m.accepted}
              {m.perAcceptedMinor != null ? `, в среднем ${uahFromMinor(m.perAcceptedMinor)} на принятую` : ""}.
            </div>
            <QueryState isLoading={days.isLoading} isError={days.isError} error={days.error} refetch={days.refetch}>
              {days.data && <AiMetricsChart points={dayPoints(days.data.rows)} />}
            </QueryState>
            <ul className="flex flex-col gap-1 text-[12.5px] text-[var(--text-muted)]">
              {m.waste
                .filter((w) => w.jobs > 0)
                .map((w) => (
                  <li key={w.key}>
                    {wasteLabel(w.key)}: {w.jobs} шт., {uahFromMinor(w.costMinor)}
                    {w.counted ? "" : " (в «зря потрачено» не входит)"}
                  </li>
                ))}
            </ul>
            {fast && <p className="text-[12.5px] text-[var(--text-muted)]">{fast}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
