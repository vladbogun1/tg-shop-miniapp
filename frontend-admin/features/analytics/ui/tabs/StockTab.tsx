"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { useMediaQuery } from "@shop/ui/use-media";
import { useShopSetting } from "@/features/settings";
import { QueryState } from "@/components/ui/QueryState";
import { staggerContainer } from "@/lib/motion";
import { uahShort } from "../../model/format";
import type { PeriodParams, Stock } from "../../model/types";
import { useStock } from "../../queries";
import { CategoriesStockPanel } from "./stock/CategoriesStockPanel";
import { DeadStockPanel } from "./stock/DeadStockPanel";
import { DemandPanel } from "./stock/DemandPanel";
import { ForgottenPanel } from "./stock/ForgottenPanel";
import { ReorderPanel } from "./stock/ReorderPanel";
import { StockAccordion, type StockSection } from "./stock/StockAccordion";
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
  // Ноутбук: «Что дозаказать» первым, остальное по важности. Телефон: список проблем со счётчиками.
  const phone = useMediaQuery("(max-width: 767px)");
  const k = s.kpis;
  const reorder: StockSection = {
    key: "reorder",
    label: "Что дозаказать",
    count: s.reorder.rows.length,
    node: <ReorderPanel s={s} coverDays={coverDays} setCoverDays={setCoverDays} />,
  };
  const dead: StockSection = {
    key: "dead",
    label: "Не продаётся",
    count: k.deadStockProducts,
    sub: uahShort(k.deadStockMinor),
    node: <DeadStockPanel s={s} deadDays={deadDays} setDeadDays={setDeadDays} />,
  };
  const demand: StockSection = {
    key: "demand",
    label: "Спрос есть, товара нет",
    count: s.reorder.missedDemand.length,
    node: <DemandPanel s={s} />,
  };
  const forgotten: StockSection = {
    key: "forgotten",
    label: "Забытый сток",
    count: k.forgottenProducts,
    sub: uahShort(k.forgottenMinor),
    node: <ForgottenPanel rows={s.forgotten} />,
  };
  const categories: StockSection = {
    key: "categories",
    label: "Склад по категориям",
    count: s.categories.length,
    node: <CategoriesStockPanel categories={s.categories} />,
  };
  const top: StockSection = {
    key: "top",
    label: "Топ товаров",
    count: s.topProducts.length,
    node: <TopProductsPanel products={s.topProducts} />,
  };
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-4">
      <StockKpis k={k} deadDays={deadDays} lowStockDays={lowStockDays} />
      {phone ? (
        <StockAccordion sections={[reorder, dead, demand, forgotten, categories, top]} />
      ) : (
        <>
          {reorder.node}
          {dead.node}
          {demand.node}
          <div className="grid gap-4 xl:grid-cols-2">
            {top.node}
            {categories.node}
          </div>
          {forgotten.node}
        </>
      )}
    </motion.div>
  );
}
