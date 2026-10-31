"use client";

import { motion } from "framer-motion";
import { LineChart as LineIcon, Grid3x3 } from "lucide-react";
import { useState } from "react";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { staggerContainer } from "@/lib/motion";
import { PREV_LABEL } from "../../model/period";
import type { Forecast, Overview, PeriodParams } from "../../model/types";
import { useForecast, useOverview } from "../../queries";
import { Heatmap, OrdersChart, SalesChart } from "../charts";
import { Panel } from "../kit";
import { CategoriesPanel } from "./overview/CategoriesPanel";
import { ChannelsPanel } from "./overview/ChannelsPanel";
import { ForecastPanel } from "./overview/ForecastPanel";
import { GiveawaysPanel } from "./overview/GiveawaysPanel";
import { OnlinePanel } from "./overview/OnlinePanel";
import { MoneyLine, OverviewKpis } from "./overview/OverviewKpis";
import { ReturnsPanel } from "./overview/ReturnsPanel";
import { SchemesPanel } from "./overview/SchemesPanel";

export function OverviewTab({ params }: { params: PeriodParams }) {
  const q = useOverview(params);
  const fq = useForecast(params.channel);
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем продажи…">
      {q.data && <OverviewBody o={q.data} params={params} forecast={fq.data} forecastError={fq.isError} />}
    </QueryState>
  );
}

function OverviewBody({
  o,
  params,
  forecast,
  forecastError,
}: {
  o: Overview;
  params: PeriodParams;
  forecast?: Forecast;
  forecastError: boolean;
}) {
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-4">
      <OverviewKpis o={o} prevLabel={PREV_LABEL[params.period]} />
      <MoneyLine money={o.money} />

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <SchemesPanel rows={o.schemes} />
        <OnlinePanel p={o.online} />
      </div>

      <ForecastPanel forecast={forecast} error={forecastError} />
      <TimeSeriesPanel o={o} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoriesPanel categories={o.categories} />
        <ChannelsPanel channels={o.channels} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel title="Когда приходят заказы" icon={Grid3x3} hint="Все оформленные заказы за период: день недели × час (Киев). Подсказка, когда делать рассылки.">
          <Heatmap grid={o.heatmap} />
        </Panel>
        <GiveawaysPanel giveaways={o.giveaways} />
      </div>

      <ReturnsPanel params={params} />
    </motion.div>
  );
}

function TimeSeriesPanel({ o }: { o: Overview }) {
  const [metric, setMetric] = useState<"soldMinor" | "receivedMinor">("soldMinor");
  const g = o.period.granularity;
  return (
    <Panel
      title={metric === "soldMinor" ? "Продажи по времени" : "Поступления по времени"}
      icon={LineIcon}
      hint={g === "WEEK" ? "По неделям" : g === "HOUR" ? "По часам" : "По дням"}
      actions={
        <SegmentedControl
          size="sm"
          options={[
            { value: "soldMinor", label: "Продано" },
            { value: "receivedMinor", label: "Получено" },
          ]}
          value={metric}
          onChange={setMetric}
        />
      }
    >
      <SalesChart series={o.series} prev={o.prevSeries} granularity={g} metric={metric} />
      <div className="mt-4">
        <OrdersChart series={o.series} granularity={g} />
      </div>
  </Panel>
  );
}
