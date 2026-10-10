"use client";

/**
 * Метрики — five tabs over /api/admin/metrics/*: Обзор · Товары и склад · Покупатели · Воронка ·
 * Операции. Calendar periods (Europe/Kyiv) with a comparison period, a channel filter, and its own
 * remembered period (no longer shared with the orders board). The tab lives in the URL (?tab=) so
 * the board's "Today" strip can link straight to the stock tab.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import "@/components/metrics/metrics.css";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { PeriodParams, PeriodToken } from "@/components/metrics/api";
import { CHANNEL_OPTIONS, PERIOD_OPTIONS, todayIso, useMetricsPeriod } from "@/components/metrics/period";
import { CustomersTab } from "@/components/metrics/tabs/CustomersTab";
import { FunnelTab } from "@/components/metrics/tabs/FunnelTab";
import { OperationsTab } from "@/components/metrics/tabs/OperationsTab";
import { OverviewTab } from "@/components/metrics/tabs/OverviewTab";
import { StockTab } from "@/components/metrics/tabs/StockTab";

const TABS = [
  { value: "overview", label: "Обзор" },
  { value: "stock", label: "Товары и склад" },
  { value: "customers", label: "Покупатели" },
  { value: "funnel", label: "Воронка" },
  { value: "operations", label: "Операции" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default function MetricsPage() {
  return (
    <Suspense>
      <Metrics />
    </Suspense>
  );
}

function Metrics() {
  const router = useRouter();
  const sp = useSearchParams();
  const raw = sp.get("tab");
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "overview";
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
          <SegmentedControl options={TABS.map((t) => ({ value: t.value, label: t.label }))} value={tab} onChange={setTab} />
        </div>
      </div>

      {tab === "overview" && <OverviewTab params={params} />}
      {tab === "stock" && <StockTab params={params} />}
      {tab === "customers" && <CustomersTab params={params} />}
      {tab === "funnel" && <FunnelTab params={params} />}
      {tab === "operations" && <OperationsTab params={params} />}
    </div>
  );
}

function PeriodPicker({ params, onChange }: { params: PeriodParams; onChange: (p: PeriodParams) => void }) {
  const [from, setFrom] = useState(params.from ?? "");
  const [to, setTo] = useState(params.to ?? "");
  // The remembered period arrives from localStorage after the first render: refill the fields then.
  const [shown, setShown] = useState({ from: params.from, to: params.to });
  if (shown.from !== params.from || shown.to !== params.to) {
    setShown({ from: params.from, to: params.to });
    setFrom(params.from ?? "");
    setTo(params.to ?? "");
  }
  const [customOpen, setCustomOpen] = useState(false);
  const showCustom = customOpen || params.period === "custom";

  function pick(period: PeriodToken) {
    if (period === "custom") {
      setCustomOpen(true);
      if (from && to) onChange({ ...params, period, from, to });
      return;
    }
    setCustomOpen(false);
    onChange({ period, channel: params.channel });
  }

  const input =
    "h-8 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text)] outline-none transition-[border-color,box-shadow] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)] pointer-coarse:h-9";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="thin-scroll -mx-1 max-w-full overflow-x-auto overflow-y-hidden px-1">
          <SegmentedControl size="sm" options={PERIOD_OPTIONS} value={showCustom ? "custom" : params.period} onChange={pick} />
        </div>
        <SegmentedControl
          size="sm"
          options={CHANNEL_OPTIONS}
          value={params.channel}
          onChange={(channel) => onChange({ ...params, channel })}
        />
      </div>
      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--text-muted)]">
          <span>с</span>
          <input type="date" className={input} value={from} max={to || todayIso()} onChange={(e) => setFrom(e.target.value)} />
          <span>по</span>
          <input type="date" className={input} value={to} min={from || undefined} max={todayIso()} onChange={(e) => setTo(e.target.value)} />
          <Button
            type="button"
            size="sm"
            variant="accent"
            disabled={!from || !to}
            onClick={() => onChange({ ...params, period: "custom", from, to })}
          >
            Показать
          </Button>
        </div>
      )}
    </div>
  );
}
