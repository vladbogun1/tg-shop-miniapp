"use client";

import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ChartTooltip } from "@/components/metrics/ChartTooltip";
import { CHART_COLORS, SERIES_PALETTE, shortDate, moneyShort } from "@/lib/metrics-format";
import { riseItem } from "@/lib/motion";

const axisProps = {
  tick: { fill: CHART_COLORS.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: CHART_COLORS.grid },
} as const;

export function ChartCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div variants={riseItem} initial="initial" animate="animate" className="panel p-5">
      <h3 className="section-title mb-4 flex items-center gap-2">
        <span aria-hidden className="h-3.5 w-[2px] rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]" />
        {title}
      </h3>
      {empty ? (
        <div className="grid h-[240px] place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
          Нет данных
        </div>
      ) : (
        children
      )}
    </motion.div>
  );
}

export function SignupsChart({ data }: { data: { date: string; count: number }[] | undefined }) {
  return (
    <ChartCard title="Новые пользователи по дням" empty={(data ?? []).length === 0}>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="usersFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={0.5} />
              <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} />
          <YAxis {...axisProps} allowDecimals={false} width={32} />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.grid }}
            content={<ChartTooltip labelFormatter={shortDate} valueFormatter={(v) => `${v} нов.`} />}
          />
          <Area type="monotone" dataKey="count" name="Новые" stroke={CHART_COLORS.accent} strokeWidth={2} fill="url(#usersFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function LanguageChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ChartCard title="Язык магазина" empty={data.length === 0}>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={56} outerRadius={92} paddingAngle={2} stroke="none">
            {data.map((d, i) => (
              <Cell key={d.name} fill={SERIES_PALETTE[i % SERIES_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip valueFormatter={(v, n) => `${n}: ${v}`} />} />
          <Legend wrapperStyle={{ fontSize: 12, color: CHART_COLORS.text }} iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function TopCustomersChart({
  data,
  currency,
}: {
  data: { name: string; spent: number; orders: number }[];
  currency: string;
}) {
  return (
    <ChartCard title="Топ покупателей" empty={data.length === 0}>
      <ResponsiveContainer width="100%" height={Math.max(260, data.length * 38)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
          <XAxis type="number" {...axisProps} tickFormatter={(v) => moneyShort(v as number, currency)} />
          <YAxis type="category" dataKey="name" {...axisProps} width={140} />
          <Tooltip
            cursor={{ fill: CHART_COLORS.cursor }}
            content={<ChartTooltip valueFormatter={(v) => moneyShort(v, currency)} />}
          />
          {/* One series = one colour (DESIGN-V3 §8): the ranking is the bar length, not its hue. */}
          <Bar dataKey="spent" name="Потрачено" fill={CHART_COLORS.accent} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
