"use client";

/**
 * Метрики — analytics dashboard (GET /api/admin/metrics?range=).
 * Neo-brutalist recharts: revenue area, orders bar, status donut, top-products
 * horizontal bar, delivery-method donut, payment-option bars, and delivery-speed
 * KPI tiles. All money ÷100, dates dd.MM, with loading/empty states.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Wallet,
  ShoppingBag,
  PackageCheck,
  Receipt,
  XCircle,
  BarChart3,
  CreditCard,
  Timer,
} from "lucide-react";
import type { ReactNode } from "react";
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
import { adminApi, type MetricsDto } from "@/lib/api";
import { useTimeRange, RANGE_OPTIONS } from "@/lib/range";
import { STATUS_LABEL, DELIVERY_LABEL } from "@/lib/orders";
import {
  CHART_COLORS,
  STATUS_COLOR,
  SERIES_PALETTE,
  moneyShort,
  shortDate,
  hoursLabel,
} from "@/lib/metrics-format";
import type { TimeRange } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { StatCard } from "@/components/ui/StatCard";
import { CenterSpinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { staggerContainer, riseItem } from "@/lib/motion";
import { ChartTooltip } from "@/components/metrics/ChartTooltip";

const axisProps = {
  tick: { fill: CHART_COLORS.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: CHART_COLORS.grid },
} as const;

const RANGE_SEG_OPTIONS = RANGE_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}));

export default function MetricsPage() {
  const [range, setRange] = useTimeRange();

  const { data, isLoading } = useQuery({
    queryKey: ["metrics", range],
    queryFn: () => adminApi.metrics(range),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader
        title="Метрики"
        subtitle="Аналитика заказов, выручки и доставки"
        actions={
          <SegmentedControl<TimeRange>
            options={RANGE_SEG_OPTIONS}
            value={range}
            onChange={setRange}
          />
        }
      />

      {isLoading || !data ? (
        <CenterSpinner label="Загружаем метрики…" />
      ) : (
        <Dashboard m={data} />
      )}
    </div>
  );
}

function Dashboard({ m }: { m: MetricsDto }) {
  const currency = m.currency || "UAH";

  const statusData = (Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[])
    .map((s) => ({
      key: s,
      name: STATUS_LABEL[s],
      value: m.statusCounts?.[s] ?? 0,
    }))
    .filter((d) => d.value > 0);

  const deliveryData = (
    Object.keys(DELIVERY_LABEL) as (keyof typeof DELIVERY_LABEL)[]
  )
    .map((d) => ({
      key: d,
      name: DELIVERY_LABEL[d],
      value: m.deliveryMethods?.[d] ?? 0,
    }))
    .filter((d) => d.value > 0);

  const topProducts = (m.topProducts ?? []).slice(0, 8);
  const paymentOptions = m.paymentOptions ?? [];
  const maxPayment = Math.max(1, ...paymentOptions.map((p) => p.count));

  const revenueByDay = m.revenueByDay ?? [];
  const ordersByDay = m.ordersByDay ?? [];

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="flex flex-col gap-4"
    >
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Выручка"
          rawValue={m.revenueMinor}
          format={(n) => moneyShort(n, currency)}
          hint="доставленные"
          accent={CHART_COLORS.delivered}
          icon={Wallet}
        />
        <StatCard
          label="Заказов всего"
          rawValue={m.totalOrders}
          accent={CHART_COLORS.accent}
          icon={ShoppingBag}
        />
        <StatCard
          label="Доставлено"
          rawValue={m.deliveredOrders}
          accent={CHART_COLORS.delivered}
          icon={PackageCheck}
        />
        <StatCard
          label="Средний чек"
          rawValue={m.avgOrderValueMinor}
          format={(n) => moneyShort(n, currency)}
          accent={CHART_COLORS.new}
          icon={Receipt}
        />
        <StatCard
          label="Отклонено"
          rawValue={m.rejectedOrders}
          accent={CHART_COLORS.rejected}
          icon={XCircle}
        />
      </div>

      {/* Revenue + Orders by day */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Выручка по дням" empty={revenueByDay.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart
              data={revenueByDay}
              margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
            >
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={CHART_COLORS.accent}
                    stopOpacity={0.5}
                  />
                  <stop
                    offset="100%"
                    stopColor={CHART_COLORS.accent}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} />
              <YAxis
                {...axisProps}
                tickFormatter={(v) => moneyShort(v as number, currency)}
                width={64}
              />
              <Tooltip
                cursor={{ stroke: CHART_COLORS.grid }}
                content={
                  <ChartTooltip
                    labelFormatter={shortDate}
                    valueFormatter={(v) => moneyShort(v, currency)}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="revenueMinor"
                name="Выручка"
                stroke={CHART_COLORS.accent}
                strokeWidth={2}
                fill="url(#revFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Заказы по дням" empty={ordersByDay.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={ordersByDay}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} />
              <YAxis {...axisProps} allowDecimals={false} width={32} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                content={
                  <ChartTooltip
                    labelFormatter={shortDate}
                    valueFormatter={(v) => `${v} зак.`}
                  />
                }
              />
              <Bar
                dataKey="count"
                name="Заказы"
                fill={CHART_COLORS.accent}
                stroke={CHART_COLORS.text}
                strokeWidth={1}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      {/* Status donut + Top products */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Заказы по статусам" empty={statusData.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                innerRadius={56}
                outerRadius={88}
                paddingAngle={2}
                stroke={CHART_COLORS.text}
                strokeWidth={2}
              >
                {statusData.map((d) => (
                  <Cell
                    key={d.key}
                    fill={STATUS_COLOR[d.key] ?? CHART_COLORS.accent}
                  />
                ))}
              </Pie>
              <Tooltip
                content={<ChartTooltip valueFormatter={(v, n) => `${n}: ${v}`} />}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: CHART_COLORS.text }}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Топ товаров" empty={topProducts.length === 0}>
          <ResponsiveContainer
            width="100%"
            height={Math.max(240, topProducts.length * 34)}
          >
            <BarChart
              data={topProducts}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
            >
              <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="title"
                {...axisProps}
                width={120}
                tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                content={
                  <ChartTooltip
                    valueFormatter={(v, n) =>
                      `${n === "qty" ? "Кол-во" : n}: ${v}`
                    }
                  />
                }
              />
              <Bar
                dataKey="qty"
                name="qty"
                stroke={CHART_COLORS.text}
                strokeWidth={1}
                maxBarSize={22}
              >
                {topProducts.map((_, i) => (
                  <Cell
                    key={i}
                    fill={SERIES_PALETTE[i % SERIES_PALETTE.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      {/* Delivery methods donut + Payment options list */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Способы доставки" empty={deliveryData.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={deliveryData}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={78}
                paddingAngle={2}
                stroke={CHART_COLORS.text}
                strokeWidth={2}
              >
                {deliveryData.map((d, i) => (
                  <Cell
                    key={d.key}
                    fill={SERIES_PALETTE[i % SERIES_PALETTE.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                content={<ChartTooltip valueFormatter={(v, n) => `${n}: ${v}`} />}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: CHART_COLORS.text }}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel
          title="Оплата"
          icon={<CreditCard className="h-[18px] w-[18px]" />}
          empty={paymentOptions.length === 0}
        >
          <div className="flex flex-col gap-3 py-2">
            {paymentOptions.map((p, i) => (
              <div key={p.title} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-bold uppercase tracking-wide text-[var(--text)]">
                    {p.title}
                  </span>
                  <span className="font-extrabold text-[var(--text)]">
                    {p.count}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface-3)]">
                  <motion.div
                    className="h-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(p.count / maxPayment) * 100}%` }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      background: SERIES_PALETTE[i % SERIES_PALETTE.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </ChartPanel>
      </div>

      {/* Delivery speed */}
      <motion.div variants={riseItem} className="panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <Timer className="h-[18px] w-[18px] text-[var(--accent)]" />
          <h3 className="text-[15px] font-extrabold uppercase tracking-wide text-[var(--text)]">
            Скорость обработки
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SpeedCard
            label="До одобрения"
            value={m.deliverySpeed?.avgApproveHours}
          />
          <SpeedCard
            label="До отправки"
            value={m.deliverySpeed?.avgShipHours}
          />
          <SpeedCard
            label="До доставки"
            value={m.deliverySpeed?.avgDeliverHours}
          />
          <SpeedCard label="Полный цикл" value={m.deliverySpeed?.avgTotalHours} />
        </div>
      </motion.div>
    </motion.div>
  );
}

/** ChartPanel — neo-brutalist panel wrapper for a chart with a title + empty state. */
function ChartPanel({
  title,
  icon,
  empty,
  children,
}: {
  title: string;
  icon?: ReactNode;
  empty?: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div variants={riseItem} className="panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[var(--accent)]">
          {icon ?? <BarChart3 className="h-[18px] w-[18px]" />}
        </span>
        <h3 className="text-[15px] font-extrabold uppercase tracking-wide text-[var(--text)]">
          {title}
        </h3>
      </div>
      {empty ? (
        <EmptyState
          icon={BarChart3}
          title="Нет данных за период"
          description="Попробуйте выбрать другой временной диапазон."
        />
      ) : (
        children
      )}
    </motion.div>
  );
}

function SpeedCard({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div className="card-2 p-4">
      <div className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1.5 text-[20px] font-extrabold text-[var(--text)]">
        {hoursLabel(value)}
      </div>
    </div>
  );
}
