"use client";

import type { TimeRange } from "@shop/core/types";
import { motion } from "framer-motion";
import { Crown, Sparkles, UserCheck, UserMinus, UserX, Users as UsersIcon } from "lucide-react";
import { QueryState } from "@/components/ui/QueryState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { CHART_COLORS } from "@/lib/metrics-format";
import { staggerContainer } from "@/lib/motion";
import { languageSlices, topCustomerBars } from "../../model/metrics";
import type { UserCardDto, UserMetricsDto } from "../../model/types";
import { useUserMetrics } from "../../queries";
import { UsersMapBlock } from "../map/UsersMapBlock";
import { LanguageChart, SignupsChart, TopCustomersChart } from "./charts";

function MetricsSkeleton() {
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

function KpiCards({ m }: { m: UserMetricsDto }) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      <StatCard label="Всего пользователей" rawValue={m.totalUsers} icon={UsersIcon} />
      <StatCard label="Новых за период" rawValue={m.newUsersInRange} icon={UserCheck} accent={CHART_COLORS.accent} />
      <StatCard label="С заказами" rawValue={m.activeUsers} icon={Sparkles} accent={CHART_COLORS.delivered} />
      <StatCard label="Без заказов" rawValue={m.inactiveUsers} icon={UserMinus} accent={CHART_COLORS.axis} />
      <StatCard label="Заблокировали бота" rawValue={m.blockedUsers} icon={UserX} accent={CHART_COLORS.rejected} />
      <StatCard label="Premium" rawValue={m.premiumUsers} icon={Crown} accent="var(--warn)" />
    </motion.div>
  );
}

export function UserMetrics({ range, onOpenUser }: { range: TimeRange; onOpenUser: (u: UserCardDto) => void }) {
  const { data: m, isLoading, isError, error, refetch } = useUserMetrics(range);

  if (isError && !m) {
    return (
      <QueryState isLoading={false} isError error={error} refetch={refetch}>
        {null}
      </QueryState>
    );
  }
  if (isLoading || !m) return <MetricsSkeleton />;

  const currency = m.currency || "UAH";
  const langData = languageSlices(m.languages);
  const topCustomers = topCustomerBars(m.topCustomers);

  return (
    <div className="flex flex-col gap-6">
      <UsersMapBlock onOpenUser={onOpenUser} />
      <KpiCards m={m} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SignupsChart data={m.newUsersByDay} />
        <LanguageChart data={langData} />
      </div>
      <TopCustomersChart data={topCustomers} currency={currency} />
    </div>
  );
}
