"use client";

/**
 * Метрики — five tabs over /api/admin/metrics/*: Обзор · Товары и склад · Покупатели · Воронка ·
 * Операции. Calendar periods (Europe/Kyiv) with a comparison period, a channel filter, and its own
 * remembered period (no longer shared with the orders board). The tab lives in the URL (?tab=) so
 * the board's "Today" strip can link straight to the stock tab.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import "./metrics.css";
import { PageHeader } from "@/components/layout/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useFinanceAccess } from "@/features/procurement";
import { PeriodPicker } from "./PeriodPicker";
import { CustomersTab } from "./tabs/CustomersTab";
import { FunnelTab } from "./tabs/FunnelTab";
import { MarginTab } from "./tabs/MarginTab";
import { OperationsTab } from "./tabs/OperationsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { PreordersTab } from "./tabs/PreordersTab";
import { StockTab } from "./tabs/StockTab";
import { useMetricsPeriod } from "./use-metrics-period";

const TABS = [
  { value: "overview", label: "Обзор" },
  { value: "stock", label: "Товары и склад" },
  { value: "customers", label: "Покупатели" },
  { value: "funnel", label: "Воронка" },
  { value: "operations", label: "Операции" },
  { value: "preorders", label: "Предзаказы" },
  { value: "margin", label: "Маржа" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/** Экран метрик; Suspense нужен из-за useSearchParams (вкладка и период живут в адресе). */
export function MetricsScreen() {
  return (
    <Suspense>
      <MetricsBody />
    </Suspense>
  );
}

function MetricsBody() {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab");
  const finance = useFinanceAccess();
  const tabs = TABS.filter((t) => t.value !== "margin" || finance);
  const tab: Tab = tabs.some((t) => t.value === raw) ? (raw as Tab) : "overview";
  const [params, setParams] = useMetricsPeriod();

  function setTab(t: Tab) {
    const next = new URLSearchParams(sp.toString());
    next.set("tab", t);
    router.replace(`/metrics?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="mx-root min-w-0">
      <PageHeader title="Метрики" subtitle="Продажи, деньги, склад, покупатели и прогнозы" />

      <div className="mb-4 flex flex-col gap-3">
        <PeriodPicker params={params} onChange={setParams} />
        <div className="thin-scroll -mx-1 overflow-x-auto overflow-y-hidden px-1 pb-1">
          <SegmentedControl options={tabs.map((t) => ({ value: t.value, label: t.label }))} value={tab} onChange={setTab} />
        </div>
      </div>

      {tab === "overview" && <OverviewTab params={params} />}
      {tab === "stock" && <StockTab params={params} />}
      {tab === "customers" && <CustomersTab params={params} />}
      {tab === "funnel" && <FunnelTab params={params} />}
      {tab === "operations" && <OperationsTab params={params} />}
      {tab === "preorders" && <PreordersTab params={params} />}
      {tab === "margin" && <MarginTab params={params} />}
    </div>
  );
}
