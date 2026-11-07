"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { uahFromMinor } from "../model/format";
import { dayLabel, type DayPoint } from "../model/metrics-view";

const axis = {
  tick: { fill: "var(--mx-axis)", fontSize: 11, fontFamily: "var(--font-body), system-ui, sans-serif" },
  tickLine: false,
  axisLine: { stroke: "var(--mx-grid)" },
} as const;

/** Расход ИИ по дням: один столбик на день, одна ось (гривны), подсказка при наведении. */
export function AiMetricsChart({ points }: { points: DayPoint[] }) {
  return (
    <div data-testid="ai-days-chart">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--mx-grid)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={dayLabel} minTickGap={16} {...axis} />
          <YAxis tickFormatter={(v) => uahFromMinor(v as number)} width={70} {...axis} />
          <Tooltip
            cursor={{ fill: "var(--mx-grid)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as DayPoint;
              return (
                <div className="rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[12px] shadow-[var(--shadow-3)]">
                  <div className="mb-1 font-semibold text-[var(--text-muted)]">{dayLabel(d.day)}</div>
                  <div className="text-[var(--text)]">Потрачено: {uahFromMinor(d.costMinor)}</div>
                  <div className="text-[var(--text)]">Принято задач: {d.accepted}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="costMinor" fill="var(--mx-s1)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
