"use client";

/**
 * Метрики — analytics dashboard (GET /api/admin/metrics?range=).
 * Liquid-glass themed recharts: revenue area, orders bar, status donut,
 * top products horizontal bar, delivery-method donut, payment-option list,
 * and delivery-speed KPI cards. All money ÷100, dates dd.MM, with empty states.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Wallet,
  ShoppingBag,
  PackageCheck,
  Receipt,
  XCircle,
} from "lucide-react";
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
import { useTimeRange } from "@/lib/range";
import { STATUS_LABEL, DELIVERY_LABEL } from "@/lib/orders";
import {
  CHART_COLORS,
  STATUS_COLOR,
  SERIES_PALETTE,
  moneyShort,
  shortDate,
  hoursLabel,
} from "@/lib/metrics-format";
import { RangeSwitcher } from "@/components/ui/RangeSwitcher";
import { MetricCard, ChartCard } from "@/components/metrics/MetricCard";
import { GlassTooltip } from "@/components/metrics/ChartTooltip";
import { Skeleton } from "@/components/ui/Skeleton";

const axisProps = {
  tick: { fill: CHART_COLORS.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: CHART_COLORS.grid },
} as const;

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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[20px] font-bold text-[var(--text)]">Метрики</h1>
        <RangeSwitcher value={range} onChange={setRange} />
      </div>

      {isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <Dashboard m={data} />
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[var(--r-lg)]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[280px] rounded-[var(--r-lg)]" />
        ))}
      </div>
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
    <div className="flex flex-col gap-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          label="Выручка"
          value={moneyShort(m.revenueMinor, currency)}
          hint="доставленные"
          accent={CHART_COLORS.delivered}
          icon={<Wallet className="h-4 w-4" />}
        />
        <MetricCard
          label="Заказов всего"
          value={m.totalOrders.toLocaleString("ru-RU")}
          icon={<ShoppingBag className="h-4 w-4" />}
        />
        <MetricCard
          label="Доставлено"
          value={m.deliveredOrders.toLocaleString("ru-RU")}
          accent={CHART_COLORS.delivered}
          icon={<PackageCheck className="h-4 w-4" />}
        />
        <MetricCard
          label="Средний чек"
          value={moneyShort(m.avgOrderValueMinor, currency)}
          icon={<Receipt className="h-4 w-4" />}
        />
        <MetricCard
          label="Отклонено"
          value={m.rejectedOrders.toLocaleString("ru-RU")}
          accent={CHART_COLORS.rejected}
          icon={<XCircle className="h-4 w-4" />}
        />
      </div>

      {/* Revenue + Orders by day */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Выручка по дням" empty={revenueByDay.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={revenueByDay} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0} />
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
                  <GlassTooltip
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
        </ChartCard>

        <ChartCard title="Заказы по дням" empty={ordersByDay.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ordersByDay} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} />
              <YAxis {...axisProps} allowDecimals={false} width={32} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                content={
                  <GlassTooltip
                    labelFormatter={shortDate}
                    valueFormatter={(v) => `${v} зак.`}
                  />
                }
              />
              <Bar
                dataKey="count"
                name="Заказы"
                fill={CHART_COLORS.accent}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Status donut + Top products */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Заказы по статусам" empty={statusData.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                innerRadius={56}
                outerRadius={88}
                paddingAngle={2}
                stroke="none"
              >
                {statusData.map((d) => (
                  <Cell key={d.key} fill={STATUS_COLOR[d.key] ?? CHART_COLORS.accent} />
                ))}
              </Pie>
              <Tooltip
                content={
                  <GlassTooltip valueFormatter={(v, n) => `${n}: ${v}`} />
                }
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: CHART_COLORS.text }}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Топ товаров" empty={topProducts.length === 0}>
          <ResponsiveContainer width="100%" height={Math.max(240, topProducts.length * 34)}>
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
                  <GlassTooltip
                    valueFormatter={(v, n) => `${n === "qty" ? "Кол-во" : n}: ${v}`}
                  />
                }
              />
              <Bar dataKey="qty" name="qty" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {topProducts.map((_, i) => (
                  <Cell key={i} fill={SERIES_PALETTE[i % SERIES_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Delivery methods donut + Payment options list */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Способы доставки" empty={deliveryData.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={deliveryData}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={78}
                paddingAngle={2}
                stroke="none"
              >
                {deliveryData.map((d, i) => (
                  <Cell key={d.key} fill={SERIES_PALETTE[i % SERIES_PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                content={<GlassTooltip valueFormatter={(v, n) => `${n}: ${v}`} />}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: CHART_COLORS.text }}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Оплата" empty={paymentOptions.length === 0}>
          <div className="flex flex-col gap-3 py-2">
            {paymentOptions.map((p, i) => (
              <div key={p.title} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--text)]">{p.title}</span>
                  <span className="font-semibold text-[var(--text-muted)]">
                    {p.count}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(p.count / maxPayment) * 100}%`,
                      background: SERIES_PALETTE[i % SERIES_PALETTE.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Delivery speed */}
      <div className="glass rounded-[var(--r-lg)] p-4">
        <h3 className="mb-3 text-[14px] font-semibold text-[var(--text)]">
          Скорость обработки
        </h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SpeedCard label="До одобрения" value={m.deliverySpeed?.avgApproveHours} />
          <SpeedCard label="До отправки" value={m.deliverySpeed?.avgShipHours} />
          <SpeedCard label="До доставки" value={m.deliverySpeed?.avgDeliverHours} />
          <SpeedCard label="Полный цикл" value={m.deliverySpeed?.avgTotalHours} />
        </div>
      </div>
    </div>
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
    <div className="rounded-[var(--r-md)] bg-white/5 p-3">
      <div className="text-[11px] font-medium text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-[18px] font-bold text-[var(--text)]">
        {hoursLabel(value)}
      </div>
    </div>
  );
}
