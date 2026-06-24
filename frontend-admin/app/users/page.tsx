"use client";

/**
 * Пользователи — bot users dashboard:
 *  KPI row + charts (new users by day, languages, top customers) from
 *  GET /api/admin/users/metrics, then a searchable/sortable/paged table from
 *  GET /api/admin/users (status = active / blocked-the-bot, premium, orders, spend).
 */
import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Users as UsersIcon,
  UserCheck,
  UserX,
  Crown,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
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
import { adminApi, type UserCardDto, type UserSortBy, type SortDir } from "@/lib/api";
import { useTimeRange } from "@/lib/range";
import { money } from "@/lib/money";
import { formatDateTime, timeAgo } from "@/lib/orders";
import {
  CHART_COLORS,
  SERIES_PALETTE,
  shortDate,
  moneyShort,
} from "@/lib/metrics-format";
import { RangeSwitcher } from "@/components/ui/RangeSwitcher";
import { MetricCard, ChartCard } from "@/components/metrics/MetricCard";
import { GlassTooltip } from "@/components/metrics/ChartTooltip";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassChip } from "@/components/ui/GlassChip";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { UserProfileDrawer } from "@/components/users/UserProfileDrawer";
import { OrderDrawer } from "@/components/orders/OrderDrawer";

const PAGE_SIZE = 30;
const axisProps = {
  tick: { fill: CHART_COLORS.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: CHART_COLORS.grid },
} as const;

function displayName(u: UserCardDto): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (u.username) return "@" + u.username;
  return "#" + u.telegramUserId;
}

export default function UsersPage() {
  const [range, setRange] = useTimeRange();
  const [profileUser, setProfileUser] = useState<UserCardDto | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[20px] font-bold text-[var(--text)]">Пользователи</h1>
        <RangeSwitcher value={range} onChange={setRange} />
      </div>

      <UserMetrics range={range} />
      <UsersTable onOpenUser={setProfileUser} />

      <UserProfileDrawer
        user={profileUser}
        onClose={() => setProfileUser(null)}
        onOpenOrder={setOpenOrderId}
      />
      <OrderDrawer orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
    </div>
  );
}

function UserMetrics({ range }: { range: "month" | "halfyear" | "year" | "all" }) {
  const { data: m, isLoading } = useQuery({
    queryKey: ["user-metrics", range],
    queryFn: () => adminApi.userMetrics(range),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  if (isLoading || !m) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[var(--r-lg)]" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[260px] rounded-[var(--r-lg)]" />
          ))}
        </div>
      </div>
    );
  }

  const currency = m.currency || "UAH";
  const langData = (m.languages ?? []).map((l) => ({
    name: l.language || "—",
    value: l.count,
  }));
  const activeData = [
    { key: "active", name: "С заказами", value: m.activeUsers },
    { key: "inactive", name: "Без заказов", value: m.inactiveUsers },
  ].filter((d) => d.value > 0);
  const topCustomers = (m.topCustomers ?? []).slice(0, 8).map((t) => ({
    name: t.name || "#" + t.telegramUserId,
    spent: t.totalSpentMinor,
    orders: t.ordersCount,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          label="Всего пользователей"
          value={m.totalUsers.toLocaleString("ru-RU")}
          icon={<UsersIcon className="h-4 w-4" />}
        />
        <MetricCard
          label="Новых за период"
          value={m.newUsersInRange.toLocaleString("ru-RU")}
          accent={CHART_COLORS.accent}
          icon={<UserCheck className="h-4 w-4" />}
        />
        <MetricCard
          label="С заказами"
          value={m.activeUsers.toLocaleString("ru-RU")}
          accent={CHART_COLORS.delivered}
          icon={<UserCheck className="h-4 w-4" />}
        />
        <MetricCard
          label="Premium"
          value={m.premiumUsers.toLocaleString("ru-RU")}
          accent="#ffd60a"
          icon={<Crown className="h-4 w-4" />}
        />
        <MetricCard
          label="Заблокировали бота"
          value={m.blockedUsers.toLocaleString("ru-RU")}
          accent={CHART_COLORS.rejected}
          icon={<UserX className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Новые пользователи по дням" empty={(m.newUsersByDay ?? []).length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={m.newUsersByDay} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
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
                content={
                  <GlassTooltip labelFormatter={shortDate} valueFormatter={(v) => `${v} нов.`} />
                }
              />
              <Area
                type="monotone"
                dataKey="count"
                name="Новые"
                stroke={CHART_COLORS.accent}
                strokeWidth={2}
                fill="url(#usersFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Активность" empty={activeData.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={activeData}
                dataKey="value"
                nameKey="name"
                innerRadius={56}
                outerRadius={88}
                paddingAngle={2}
                stroke="none"
              >
                {activeData.map((d) => (
                  <Cell
                    key={d.key}
                    fill={d.key === "active" ? CHART_COLORS.delivered : CHART_COLORS.axis}
                  />
                ))}
              </Pie>
              <Tooltip content={<GlassTooltip valueFormatter={(v, n) => `${n}: ${v}`} />} />
              <Legend wrapperStyle={{ fontSize: 12, color: CHART_COLORS.text }} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Языки" empty={langData.length === 0}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={langData}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={78}
                paddingAngle={2}
                stroke="none"
              >
                {langData.map((d, i) => (
                  <Cell key={d.name} fill={SERIES_PALETTE[i % SERIES_PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip content={<GlassTooltip valueFormatter={(v, n) => `${n}: ${v}`} />} />
              <Legend wrapperStyle={{ fontSize: 12, color: CHART_COLORS.text }} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Топ покупателей" empty={topCustomers.length === 0}>
          <ResponsiveContainer width="100%" height={Math.max(240, topCustomers.length * 34)}>
            <BarChart data={topCustomers} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} tickFormatter={(v) => moneyShort(v as number, currency)} />
              <YAxis type="category" dataKey="name" {...axisProps} width={130} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                content={<GlassTooltip valueFormatter={(v) => moneyShort(v, currency)} />}
              />
              <Bar dataKey="spent" name="Потрачено" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {topCustomers.map((_, i) => (
                  <Cell key={i} fill={SERIES_PALETTE[i % SERIES_PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function UsersTable({ onOpenUser }: { onOpenUser: (u: UserCardDto) => void }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState<UserSortBy>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    setPage(0);
  }, [debounced, blockedOnly, sortBy, sortDir]);

  function toggleSort(col: UserSortBy) {
    if (col === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["users-table", debounced, blockedOnly, page, sortBy, sortDir],
    queryFn: () =>
      adminApi.users({
        q: debounced || undefined,
        blockedOnly,
        page,
        size: PAGE_SIZE,
        sortBy,
        sortDir,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = data ?? [];
  const hasNext = rows.length >= PAGE_SIZE;

  return (
    <div className="glass rounded-[var(--r-lg)] p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <GlassInput
            label="Поиск (имя, @username, ID)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <GlassChip active={blockedOnly} onClick={() => setBlockedOnly((b) => !b)}>
          Заблокировали бота
        </GlassChip>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-white/10 text-left text-[var(--text-muted)]">
              <th className="px-3 py-2 font-medium">Пользователь</th>
              <th className="px-3 py-2 font-medium">Язык</th>
              <SortableTh label="Заказы" col="ordersCount" {...{ sortBy, sortDir, toggleSort }} />
              <SortableTh label="Потрачено" col="totalSpentMinor" {...{ sortBy, sortDir, toggleSort }} />
              <th className="px-3 py-2 font-medium">Статус</th>
              <SortableTh label="Регистрация" col="createdAt" {...{ sortBy, sortDir, toggleSort }} />
              <SortableTh label="Был(а)" col="lastSeenAt" {...{ sortBy, sortDir, toggleSort }} />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td colSpan={7} className="px-3 py-2">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              : rows.map((u) => (
                  <tr
                    key={u.telegramUserId}
                    onClick={() => onOpenUser(u)}
                    className="cursor-pointer border-b border-white/5 hover:bg-white/5"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-[var(--text)]">{displayName(u)}</div>
                      <div className="text-[11px] text-[var(--text-faint)]">
                        {u.username ? "@" + u.username + " · " : ""}#{u.telegramUserId}
                        {u.premium ? " · ⭐ premium" : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-muted)]">{u.languageCode || "—"}</td>
                    <td className="px-3 py-2.5 text-[var(--text-muted)]">{u.ordersCount}</td>
                    <td className="px-3 py-2.5 text-[var(--text)]">{money(u.totalSpentMinor)}</td>
                    <td className="px-3 py-2.5">
                      {u.botBlocked ? (
                        <Badge color="#ff453a">заблокировал</Badge>
                      ) : (
                        <Badge color="#30d158">активен</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-muted)]">
                      {u.createdAt ? formatDateTime(u.createdAt) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-muted)]">
                      {u.lastSeenAt ? timeAgo(u.lastSeenAt) : "—"}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {(isLoading ? [] : rows).map((u) => (
          <div
            key={u.telegramUserId}
            onClick={() => onOpenUser(u)}
            className="cursor-pointer rounded-[var(--r-md)] bg-white/5 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-[var(--text)]">{displayName(u)}</div>
                <div className="truncate text-[11px] text-[var(--text-faint)]">
                  {u.username ? "@" + u.username + " · " : ""}#{u.telegramUserId}
                </div>
              </div>
              {u.botBlocked ? (
                <Badge color="#ff453a">заблок.</Badge>
              ) : (
                <Badge color="#30d158">активен</Badge>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[12px] text-[var(--text-muted)]">
              <span>{u.ordersCount} зак.</span>
              <span className="text-[var(--text)]">{money(u.totalSpentMinor)}</span>
              {u.premium && <span>⭐</span>}
              <span className="ml-auto">{u.createdAt ? formatDateTime(u.createdAt) : ""}</span>
            </div>
          </div>
        ))}
      </div>

      {!isLoading && rows.length === 0 && (
        <div className="py-10 text-center text-[13px] text-[var(--text-faint)]">
          Ничего не найдено
        </div>
      )}

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="mr-1 text-[12px] text-[var(--text-faint)]">
          Стр. {page + 1}
          {isFetching ? " · …" : ""}
        </span>
        <GlassButton
          size="sm"
          variant="glass"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          icon={<ChevronLeft className="h-4 w-4" />}
        />
        <GlassButton
          size="sm"
          variant="glass"
          disabled={!hasNext}
          onClick={() => setPage((p) => p + 1)}
          icon={<ChevronRight className="h-4 w-4" />}
        />
      </div>
    </div>
  );
}

function SortableTh({
  label,
  col,
  sortBy,
  sortDir,
  toggleSort,
}: {
  label: string;
  col: UserSortBy;
  sortBy: UserSortBy;
  sortDir: SortDir;
  toggleSort: (c: UserSortBy) => void;
}) {
  const active = sortBy === col;
  return (
    <th className="px-3 py-2 font-medium">
      <button
        onClick={() => toggleSort(col)}
        className={`flex items-center gap-1 transition-colors hover:text-[var(--text)] ${
          active ? "text-[var(--text)]" : ""
        }`}
      >
        {label}
        {active &&
          (sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    </th>
  );
}
