"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { useShopSetting } from "@/features/settings";
import { QueryState } from "@/components/ui/QueryState";
import { staggerContainer } from "@/lib/motion";
import type { PeriodParams, Stock } from "../../model/types";
import { useStock } from "../../queries";
import { CategoriesStockPanel } from "./stock/CategoriesStockPanel";
import { DeadStockPanel } from "./stock/DeadStockPanel";
import { DemandPanel } from "./stock/DemandPanel";
import { ForgottenPanel } from "./stock/ForgottenPanel";
import { ReorderPanel } from "./stock/ReorderPanel";
import { StockKpis } from "./stock/StockKpis";
import { TopProductsPanel } from "./stock/TopProductsPanel";

export function StockTab({ params }: { params: PeriodParams }) {
  // Default threshold comes from «Настройки» (metrics.deadStockDays); a click on 30/60/90 overrides it.
  const defaultDead = useShopSetting("metrics.deadStockDays", 60);
  const [pickedDead, setDeadDays] = useState<number | null>(null);
  const deadDays = pickedDead ?? defaultDead;
  const [coverDays, setCoverDays] = useState<number>(30);
  const q = useStock(params, deadDays, coverDays);
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем склад…">
      {q.data && (
        <StockBody s={q.data} deadDays={deadDays} setDeadDays={setDeadDays} coverDays={coverDays} setCoverDays={setCoverDays} />
      )}
    </QueryState>
  );
}

function StockBody({
  s,
  deadDays,
  setDeadDays,
  coverDays,
  setCoverDays,
}: {
  s: Stock;
  deadDays: number;
  setDeadDays: (n: number) => void;
  coverDays: number;
  setCoverDays: (n: number) => void;
}) {
  // The backend counts "running out" with the setting metrics.lowStockDays — show the same number.
  const lowStockDays = useShopSetting("metrics.lowStockDays", 14);
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-4">
      <StockKpis k={s.kpis} deadDays={deadDays} lowStockDays={lowStockDays} />
      <ReorderPanel s={s} coverDays={coverDays} setCoverDays={setCoverDays} />
      <DemandPanel s={s} />
      <DeadStockPanel s={s} deadDays={deadDays} setDeadDays={setDeadDays} />
      <div className="grid gap-4 xl:grid-cols-2">
        <TopProductsPanel products={s.topProducts} />
        <CategoriesStockPanel categories={s.categories} />
      </div>
      <ForgottenPanel rows={s.forgotten} />
    </motion.div>
  );
}
