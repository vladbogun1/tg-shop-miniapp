"use client";

/**
 * Charts of the metrics page. Rules kept throughout (dataviz): one y-axis per chart (sold ₴ and
 * order counts are two charts, not a dual axis), thin marks, recessive grid, a legend whenever there
 * are two series, hover tooltips on every chart, colours from the validated tokens in metrics.css.
 */
import { useState, type ReactNode } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ForecastPoint, SeriesPoint } from "./api";
import { bucketLabel, num, pct, uah, uahShort } from "./format";

const axis = {
  tick: { fill: "var(--mx-axis)", fontSize: 11, fontFamily: "var(--font-body), system-ui, sans-serif" },
  tickLine: false,
  axisLine: { stroke: "var(--mx-grid)" },
} as const;

interface TipRow {
  color: string;
  label: string;
  value: string;
  dashed?: boolean;
}

function TipBox({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="min-w-[150px] rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[12px] shadow-[var(--shadow-3)]">
      <div className="font-display mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">{title}</div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
              <span
                className="inline-block h-0 w-3 shrink-0"
                style={{ borderTop: `2px ${r.dashed ? "dashed" : "solid"} ${r.color}` }}
              />
              {r.label}
            </span>
            <span className="font-semibold text-[var(--text)] mx-num">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string; dashed?: boolean; box?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--text-muted)]">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.box ? (
            <span className="inline-block h-3 w-3 rounded-[2px]" style={{ background: i.color }} />
          ) : (
            <span
              className="inline-block h-0 w-4"
              style={{ borderTop: `2px ${i.dashed ? "dashed" : "solid"} ${i.color}` }}
            />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Sold ₴ per bucket with the comparison period as a dashed line (aligned by position). */
export function SalesChart({
  series,
  prev,
  granularity,
  metric = "soldMinor",
}: {
  series: SeriesPoint[];
  prev: SeriesPoint[];
  granularity: string;
  metric?: "soldMinor" | "receivedMinor";
}) {
  const data = series.map((p, i) => ({
    bucket: p.bucket,
    cur: p[metric],
    prev: prev[i]?.[metric] ?? null,
    prevBucket: prev[i]?.bucket,
  }));
  const name = metric === "soldMinor" ? "Продано" : "Получено";
  return (
    <>
      <Legend
        items={[
          { color: "var(--mx-s1)", label: `${name}, текущий период` },
          { color: "var(--mx-prev)", label: "Прошлый период", dashed: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--mx-grid)" vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={(k) => bucketLabel(k, granularity)} minTickGap={16} {...axis} />
          <YAxis tickFormatter={(v) => uahShort(v as number)} width={70} {...axis} />
          <Tooltip
            cursor={{ stroke: "var(--mx-axis)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return (
                <TipBox
                  title={bucketLabel(d.bucket, granularity)}
                  rows={[
                    { color: "var(--mx-s1)", label: name, value: uah(d.cur) },
                    ...(d.prev != null
                      ? [{ color: "var(--mx-prev)", label: `было (${bucketLabel(d.prevBucket ?? "", granularity)})`, value: uah(d.prev), dashed: true }]
                      : []),
                  ]}
                />
              );
            }}
          />
          <Line type="linear" dataKey="prev" stroke="var(--mx-prev)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="cur" stroke="var(--mx-s1)" strokeWidth={2} dot={data.length <= 14 ? { r: 3, fill: "var(--mx-s1)", strokeWidth: 0 } : false} activeDot={{ r: 4.5, fill: "var(--mx-s1)", stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

/** Orders per bucket: accepted and rejected stacked, with a surface gap between segments. */
export function OrdersChart({ series, granularity }: { series: SeriesPoint[]; granularity: string }) {
  return (
    <>
      <Legend
        items={[
          { color: "var(--mx-s1)", label: "Заказы (не отклонённые)", box: true },
          { color: "var(--mx-s2)", label: "Отклонённые", box: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--mx-grid)" vertical={false} />
          <XAxis dataKey="bucket" tickFormatter={(k) => bucketLabel(k, granularity)} minTickGap={16} {...axis} />
          <YAxis allowDecimals={false} width={32} {...axis} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,.04)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as SeriesPoint;
              return (
                <TipBox
                  title={bucketLabel(d.bucket, granularity)}
                  rows={[
                    { color: "var(--mx-s1)", label: "Заказы", value: num(d.orders) },
                    { color: "var(--mx-s2)", label: "Отклонено", value: num(d.rejected) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="orders" stackId="o" fill="var(--mx-s1)" stroke="var(--surface)" strokeWidth={2} maxBarSize={22} isAnimationActive={false} />
          <Bar dataKey="rejected" stackId="o" fill="var(--mx-s2)" stroke="var(--surface)" strokeWidth={2} maxBarSize={22} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

/** Weekly actuals, then the forecast weeks with the 10–90% band. */
export function ForecastChart({ history, forecast }: { history: ForecastPoint[]; forecast: ForecastPoint[] }) {
  const data = [
    ...history.map((p) => ({ date: p.date, actual: p.valueMinor, forecast: null as number | null, band: null as [number, number] | null })),
    ...forecast.map((p) => ({
      date: p.date,
      actual: null as number | null,
      forecast: p.valueMinor,
      band: p.lowMinor != null && p.highMinor != null ? ([p.lowMinor, p.highMinor] as [number, number]) : null,
    })),
  ];
  return (
    <>
      <Legend
        items={[
          { color: "var(--mx-s1)", label: "Факт по неделям", box: true },
          { color: "var(--mx-s3)", label: "Прогноз", box: true },
          { color: "var(--mx-band)", label: "Вероятный диапазон (10–90%)", box: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--mx-grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(k) => bucketLabel(k)} {...axis} />
          <YAxis tickFormatter={(v) => uahShort(v as number)} width={70} {...axis} />
          <Tooltip
            cursor={{ fill: "var(--mx-grid)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              const rows: TipRow[] =
                d.actual != null
                  ? [{ color: "var(--mx-s1)", label: "Факт", value: uah(d.actual) }]
                  : [
                      { color: "var(--mx-s3)", label: "Прогноз", value: uah(d.forecast) },
                      ...(d.band ? [{ color: "var(--mx-band)", label: "Диапазон", value: `${uahShort(d.band[0])} – ${uahShort(d.band[1])}` }] : []),
                    ];
              return <TipBox title={`Неделя с ${bucketLabel(d.date)}`} rows={rows} />;
            }}
          />
          <Area dataKey="band" stroke="none" fill="var(--mx-band)" isAnimationActive={false} />
          <Bar dataKey="actual" fill="var(--mx-s1)" stroke="var(--surface)" strokeWidth={2} maxBarSize={26} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="forecast" fill="var(--mx-s3)" stroke="var(--surface)" strokeWidth={2} maxBarSize={26} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

const RAMP = ["--mx-q1", "--mx-q2", "--mx-q3", "--mx-q4", "--mx-q5", "--mx-q6", "--mx-q7"];
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Orders by weekday × hour, sequential orange (dark → bright); hover shows the exact count. */
export function Heatmap({ grid }: { grid: number[][] }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(1, ...grid.flat());
  const total = grid.flat().reduce((a, b) => a + b, 0);
  const color = (v: number) => (v === 0 ? "var(--mx-q0)" : `var(${RAMP[Math.min(RAMP.length - 1, Math.floor((v / max) * RAMP.length))]})`);
  return (
    <div>
      <div className="thin-scroll overflow-x-auto">
        <div className="grid min-w-[560px] gap-[2px]" style={{ gridTemplateColumns: "28px repeat(24, minmax(0, 1fr))" }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center text-[10px] text-[var(--mx-axis)] mx-num">
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
          {grid.map((row, d) => (
            <HeatRow key={d} label={DAYS[d]}>
              {row.map((v, h) => (
                <div
                  key={h}
                  className="h-5 rounded-[2px] outline-offset-0"
                  style={{
                    background: color(v),
                    outline: hover?.d === d && hover?.h === h ? "2px solid #FFFFFF" : undefined,
                  }}
                  onMouseEnter={() => setHover({ d, h })}
                  onMouseLeave={() => setHover(null)}
                  aria-label={`${DAYS[d]} ${h}:00 — ${v} заказов`}
                />
              ))}
            </HeatRow>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--text-muted)]">
        <span className="mx-num">
          {hover
            ? `${DAYS[hover.d]}, ${hover.h}:00–${hover.h + 1}:00 — ${grid[hover.d][hover.h]} заказ(ов)`
            : `Всего ${num(total)} заказов. Наведите на клетку.`}
        </span>
        <span className="flex items-center gap-1">
          0
          {RAMP.map((r) => (
            <span key={r} className="inline-block h-3 w-4 rounded-[2px]" style={{ background: `var(${r})` }} />
          ))}
          {max}
        </span>
      </div>
    </div>
  );
}

function HeatRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div className="font-display flex items-center text-[11px] font-semibold text-[var(--text-muted)]">{label}</div>
      {children}
    </>
  );
}

/** Funnel: one bar per step on an ordinal ramp, with % of the start and of the previous step. */
export function FunnelBars({
  steps,
}: {
  steps: { key: string; label: string; count: number; fromStartPct: number | null; fromPrevPct: number | null }[];
}) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  const ramp = ["--mx-q7", "--mx-q6", "--mx-q5", "--mx-q4", "--mx-q4", "--mx-q3", "--mx-q3"];
  return (
    <div className="flex flex-col gap-2.5">
      {steps.map((s, i) => (
        <div key={s.key} className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[170px_1fr_220px]">
          <div className="text-[13px] font-semibold text-[var(--text)]">{s.label}</div>
          <div className="h-7 overflow-hidden rounded-[4px] bg-[var(--surface-2)]">
            <div
              className="h-full rounded-r-[4px]"
              style={{ width: `${Math.max(1.5, (s.count / max) * 100)}%`, background: `var(${ramp[i] ?? "--mx-q3"})` }}
            />
          </div>
          <div className="text-[12px] text-[var(--text-muted)] mx-num">
            <b className="mr-1 text-[var(--text)]">{num(s.count)}</b>
            {i === 0 ? "100%" : `${pct(s.fromStartPct)} от входа`}
            {i > 0 && s.fromPrevPct != null && <span className="ml-1 text-[var(--text-faint)]">· {pct(s.fromPrevPct)} шага</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars for a ranked list (one series → one colour), label and value as text. */
export function RankBars({
  rows,
  format,
  sub,
}: {
  rows: { key: string; label: string; value: number }[];
  format: (v: number) => string;
  sub?: (key: string) => ReactNode;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-[var(--text)]">{r.label}</span>
            <span className="font-display shrink-0 font-bold text-[var(--text)] mx-num">{format(r.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div className="h-full rounded-full" style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, background: "var(--mx-s1)" }} />
          </div>
          {sub && <div className="text-[11px] text-[var(--text-faint)]">{sub(r.key)}</div>}
        </div>
      ))}
    </div>
  );
}
