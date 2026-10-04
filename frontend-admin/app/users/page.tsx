"use client";

/**
 * Пользователи — two tabs (R11):
 *  - «Список»: search first, then a sortable / paged table (GET /api/admin/users); on a phone,
 *    cards with a sort select. Language = the one chosen in the shop (users.locale).
 *  - «Аналитика»: KPI cards + charts (GET /api/admin/users/metrics); the period switch lives
 *    here only — it never filtered the table, which read as a broken filter (D7).
 * A row opens the UserProfileDrawer; an order in it opens the OrderDrawer ON TOP, so closing it
 * returns to the profile and the list with its search and page intact.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Users as UsersIcon,
  UserCheck,
  UserMinus,
  UserX,
  Crown,
  Sparkles,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Inbox,
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
import {
  adminApi,
  type UserCardDto,
  type UserSortBy,
  type SortDir,
  type TimeRange,
} from "@/lib/api";
import { LANG_SHORT, type UserCard } from "@/lib/api-extra";
import { useTimeRange, RANGE_OPTIONS } from "@/lib/range";
import { money } from "@/lib/money";
import { formatDateTime, timeAgo } from "@/lib/orders";
import {
  CHART_COLORS,
  SERIES_PALETTE,
  shortDate,
  moneyShort,
} from "@/lib/metrics-format";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChartTooltip } from "@/components/metrics/ChartTooltip";
import { UserProfileDrawer } from "@/components/users/UserProfileDrawer";
import { OrderDrawer } from "@/components/orders/OrderDrawer";
import { QueryState } from "@/components/ui/QueryState";
import { Select } from "@/components/ui/Select";
import { staggerContainer, riseItem } from "@/lib/motion";

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

function initials(u: UserCardDto): string {
  const a = u.firstName?.trim()?.[0] ?? u.username?.trim()?.[0] ?? "";
  const b = u.lastName?.trim()?.[0] ?? "";
  const both = (a + b).toUpperCase();
  return both || String(u.telegramUserId).slice(0, 2);
}

/** Shop language (users.locale) with the Telegram one as a marked fallback. */
function userLang(u: UserCard): { label: string; fromTelegram: boolean } {
  if (u.locale) return { label: LANG_SHORT[u.locale] ?? u.locale.toUpperCase(), fromTelegram: false };
  if (u.languageCode) return { label: u.languageCode.slice(0, 2).toUpperCase(), fromTelegram: true };
  return { label: "—", fromTelegram: false };
}

function LangCell({ u }: { u: UserCard }) {
  const l = userLang(u);
  return (
    <span
      title={l.fromTelegram ? "Язык не выбран в магазине — показан язык Telegram" : "Язык, выбранный в магазине"}
      className={l.fromTelegram ? "text-[var(--text-faint)]" : "font-bold text-[var(--text)]"}
    >
      {l.label}
      {l.fromTelegram && <sup className="ml-0.5 text-[9px]">TG</sup>}
    </span>
  );
}

type Tab = "list" | "analytics";

export default function UsersPage() {
  const [range, setRange] = useTimeRange();
  const [tab, setTab] = useState<Tab>("list");
  const [profileUser, setProfileUser] = useState<UserCardDto | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  return (
    <div className="min-w-0">
      <PageHeader title="Пользователи" subtitle="Пользователи бота, их заказы и аналитика" />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Tab>
          options={[
            { value: "list", label: "Список" },
            { value: "analytics", label: "Аналитика" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "analytics" && (
          <SegmentedControl<TimeRange> options={RANGE_OPTIONS} value={range} onChange={setRange} size="sm" />
        )}
      </div>

      {tab === "list" ? <UsersTable onOpenUser={setProfileUser} /> : <UserMetrics range={range} />}

      <UserProfileDrawer
        user={profileUser}
        onClose={() => setProfileUser(null)}
        onOpenOrder={setOpenOrderId}
      />
      {/* Mounted after the profile drawer, so it stacks above it (same z-index, later in the DOM). */}
      <OrderDrawer orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ metrics */

function UserMetrics({ range }: { range: TimeRange }) {
  const { data: m, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["user-metrics", range],
    queryFn: () => adminApi.userMetrics(range),
    placeholderData: keepPreviousData,
    refetchInterval: 120_000,
  });

  if (isError && !m) {
    return <QueryState isLoading={false} isError error={error} refetch={refetch}>{null}</QueryState>;
  }
  if (isLoading || !m) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[116px] rounded-[var(--r-lg)]" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[300px] rounded-[var(--r-lg)]" />
          ))}
        </div>
      </div>
    );
  }

  const currency = m.currency || "UAH";
  // users.locale (the language chosen in the shop); "—" = never chose.
  const langData = (m.languages ?? []).map((l) => ({
    name: l.language && l.language !== "—" ? (LANG_SHORT[l.language] ?? l.language) : "не выбран",
    value: l.count,
  }));
  const topCustomers = (m.topCustomers ?? []).slice(0, 8).map((t) => ({
    name: t.name || "#" + t.telegramUserId,
    spent: t.totalSpentMinor,
    orders: t.ordersCount,
  }));

  return (
    <div className="flex flex-col gap-6">
      <motion.div
        className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        <StatCard
          label="Всего пользователей"
          rawValue={m.totalUsers}
          icon={UsersIcon}
        />
        <StatCard
          label="Новых за период"
          rawValue={m.newUsersInRange}
          icon={UserCheck}
          accent={CHART_COLORS.accent}
        />
        <StatCard
          label="С заказами"
          rawValue={m.activeUsers}
          icon={Sparkles}
          accent={CHART_COLORS.delivered}
        />
        <StatCard
          label="Без заказов"
          rawValue={m.inactiveUsers}
          icon={UserMinus}
          accent={CHART_COLORS.axis}
        />
        <StatCard
          label="Заблокировали бота"
          rawValue={m.blockedUsers}
          icon={UserX}
          accent={CHART_COLORS.rejected}
        />
        <StatCard
          label="Premium"
          rawValue={m.premiumUsers}
          icon={Crown}
          accent="var(--c3)"
        />
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Новые пользователи по дням"
          empty={(m.newUsersByDay ?? []).length === 0}
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart
              data={m.newUsersByDay}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
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
                  <ChartTooltip
                    labelFormatter={shortDate}
                    valueFormatter={(v) => `${v} нов.`}
                  />
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

        <ChartCard title="Язык магазина" empty={langData.length === 0}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={langData}
                dataKey="value"
                nameKey="name"
                innerRadius={56}
                outerRadius={92}
                paddingAngle={2}
                stroke="none"
              >
                {langData.map((d, i) => (
                  <Cell key={d.name} fill={SERIES_PALETTE[i % SERIES_PALETTE.length]} />
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
        </ChartCard>
      </div>

      <ChartCard title="Топ покупателей" empty={topCustomers.length === 0}>
        <ResponsiveContainer
          width="100%"
          height={Math.max(260, topCustomers.length * 38)}
        >
          <BarChart
            data={topCustomers}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          >
            <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
            <XAxis
              type="number"
              {...axisProps}
              tickFormatter={(v) => moneyShort(v as number, currency)}
            />
            <YAxis type="category" dataKey="name" {...axisProps} width={140} />
            <Tooltip
              cursor={{ fill: "rgba(124,108,255,0.08)" }}
              content={
                <ChartTooltip valueFormatter={(v) => moneyShort(v, currency)} />
              }
            />
            <Bar dataKey="spent" name="Потрачено" radius={[0, 6, 6, 0]} maxBarSize={24}>
              {topCustomers.map((_, i) => (
                <Cell key={i} fill={SERIES_PALETTE[i % SERIES_PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={riseItem}
      initial="initial"
      animate="animate"
      className="panel p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="h-4 w-1.5 bg-[var(--accent)]" />
        <span className="text-[14px] font-extrabold uppercase tracking-wide text-[var(--text)]">
          {title}
        </span>
      </div>
      {empty ? (
        <div className="grid h-[240px] place-items-center text-[13px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
          Нет данных
        </div>
      ) : (
        children
      )}
    </motion.div>
  );
}

/* -------------------------------------------------------------------- table */

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

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
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

  const rows = useMemo(() => (data ?? []) as UserCard[], [data]);
  const hasNext = rows.length >= PAGE_SIZE;

  return (
    <div className="panel overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b-[3px] border-[var(--line)] p-4">
        <div className="min-w-[200px] flex-1">
          <Input
            placeholder="Поиск: имя, @username, ID"
            icon={<Search className="h-4 w-4" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant={blockedOnly ? "accent" : "surface"}
          size="md"
          icon={<UserX className="h-4 w-4" />}
          onClick={() => setBlockedOnly((b) => !b)}
        >
          Заблокировали бота
        </Button>
        {/* Phones have no sortable table headers — sort from here. */}
        <div className="w-full md:hidden">
          <Select<string>
            label="Сортировка"
            value={`${sortBy}:${sortDir}`}
            onChange={(v) => {
              const [col, dir] = v.split(":");
              setSortBy(col as UserSortBy);
              setSortDir(dir as SortDir);
            }}
            options={MOBILE_SORTS}
          />
        </div>
      </div>

      {isError && !data ? (
        <div className="p-4">
          <QueryState isLoading={false} isError error={error} refetch={refetch}>
            {null}
          </QueryState>
        </div>
      ) : null}

      {/* Desktop table */}
      <div className="thin-scroll hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-[var(--surface-2)] [&_th]:border-b-[3px] [&_th]:border-[var(--line)]">
            <tr className="text-left text-[11px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
              <th className="px-4 py-3">Пользователь</th>
              <th className="px-4 py-3">Язык</th>
              <SortableTh label="Заказы" col="ordersCount" {...{ sortBy, sortDir, toggleSort }} />
              <SortableTh label="Потрачено" col="totalSpentMinor" {...{ sortBy, sortDir, toggleSort }} />
              <th className="px-4 py-3">Статус</th>
              <SortableTh label="Регистрация" col="createdAt" {...{ sortBy, sortDir, toggleSort }} />
              <SortableTh label="Был(а)" col="lastSeenAt" {...{ sortBy, sortDir, toggleSort }} />
            </tr>
          </thead>
          <motion.tbody
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            key={`${debounced}-${blockedOnly}-${page}-${sortBy}-${sortDir}`}
          >
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-t-2 border-[var(--border)]">
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-6 w-full rounded-[var(--r-sm)]" />
                    </td>
                  </tr>
                ))
              : rows.map((u) => (
                  <motion.tr
                    key={u.telegramUserId}
                    variants={riseItem}
                    onClick={() => onOpenUser(u)}
                    className="cursor-pointer border-t-2 border-[var(--border)] transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="accent-fill grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] text-[12px] font-extrabold text-[var(--accent-ink)]">
                          {initials(u)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-bold text-[var(--text)]">
                              {displayName(u)}
                            </span>
                            {u.premium && (
                              <Crown className="h-3.5 w-3.5 shrink-0 text-[var(--c3)]" />
                            )}
                          </div>
                          <div className="truncate text-[11px] text-[var(--text-faint)]">
                            {u.username ? "@" + u.username + " · " : ""}#{u.telegramUserId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <LangCell u={u} />
                    </td>
                    <td className="px-4 py-3 font-semibold text-[var(--text-muted)]">{u.ordersCount}</td>
                    <td className="px-4 py-3 font-bold text-[var(--text)]">
                      {money(u.totalSpentMinor)}
                    </td>
                    <td className="px-4 py-3">
                      {u.botBlocked ? (
                        <Badge tone="danger" dot>
                          заблокировал
                        </Badge>
                      ) : (
                        <Badge tone="ok" dot>
                          активен
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {u.createdAt ? formatDateTime(u.createdAt) : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {u.lastSeenAt ? timeAgo(u.lastSeenAt) : "—"}
                    </td>
                  </motion.tr>
                ))}
          </motion.tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <motion.div
        className="flex flex-col gap-2.5 p-4 md:hidden"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        key={`m-${debounced}-${blockedOnly}-${page}-${sortBy}-${sortDir}`}
      >
        {(isLoading ? [] : rows).map((u) => (
          <motion.button
            key={u.telegramUserId}
            type="button"
            variants={riseItem}
            whileTap={{ scale: 0.99 }}
            onClick={() => onOpenUser(u)}
            className="card nb-press flex w-full flex-col gap-2 p-3.5 text-left"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="accent-fill grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] text-[12px] font-extrabold text-[var(--accent-ink)]">
                  {initials(u)}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-bold text-[var(--text)]">
                    {displayName(u)}
                  </div>
                  <div className="truncate text-[11px] text-[var(--text-faint)]">
                    {u.username ? "@" + u.username + " · " : ""}#{u.telegramUserId}
                  </div>
                </div>
              </div>
              {u.botBlocked ? (
                <Badge tone="danger" dot>
                  заблок.
                </Badge>
              ) : (
                <Badge tone="ok" dot>
                  активен
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-[12px] text-[var(--text-muted)]">
              <span>{u.ordersCount} зак.</span>
              <LangCell u={u} />
              <span className="font-bold text-[var(--text)]">
                {money(u.totalSpentMinor)}
              </span>
              {u.premium && <Crown className="h-3.5 w-3.5 text-[var(--c3)]" />}
              <span className="ml-auto">
                {u.createdAt ? formatDateTime(u.createdAt) : ""}
              </span>
            </div>
          </motion.button>
        ))}
      </motion.div>

      {!isLoading && !isError && rows.length === 0 && (
        <div className="p-6">
          <EmptyState
            icon={Inbox}
            title="Ничего не найдено"
            description="Попробуйте изменить запрос или сбросить фильтр."
          />
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 border-t-[3px] border-[var(--line)] p-4">
        <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
          Стр. {page + 1}
          {isFetching ? " · …" : ""}
        </span>
        <Button
          variant="surface"
          size="icon"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          icon={<ChevronLeft className="h-4 w-4" />}
          aria-label="Назад"
        />
        <Button
          variant="surface"
          size="icon"
          disabled={!hasNext}
          onClick={() => setPage((p) => p + 1)}
          icon={<ChevronRight className="h-4 w-4" />}
          aria-label="Вперёд"
        />
      </div>
    </div>
  );
}

const MOBILE_SORTS: { value: string; label: string }[] = [
  { value: "createdAt:desc", label: "Новые сначала" },
  { value: "createdAt:asc", label: "Старые сначала" },
  { value: "lastSeenAt:desc", label: "Недавно заходили" },
  { value: "ordersCount:desc", label: "Больше заказов" },
  { value: "totalSpentMinor:desc", label: "Больше потратили" },
  { value: "username:asc", label: "Username А–Я" },
];

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
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={`flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-[var(--text)] ${
          active ? "text-[var(--accent)]" : ""
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
